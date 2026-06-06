#!/usr/bin/env python3
"""Local Music-Flamingo audio-understanding service for DJ Charlie.

A dumb, stateless audio -> text box. The browser (public/index.html) taps the
Daily room mic, keeps a rolling 10s buffer, and ships a 16kHz mono WAV here over
a WebSocket whenever Charlie calls the `analyze_audio` tool. We run NVIDIA
Music-Flamingo on the clip and send back a short, DJ-actionable musical
description, which the browser injects into Charlie's LLM context.

Protocol (one JSON text frame each way):
    client -> {"prompt": "<optional override>", "audio_b64": "<base64 WAV>"}
    server -> {"description": "..."}   on success
    server -> {"error": "..."}         on failure

Env knobs:
    MODEL_ID   default "nvidia/music-flamingo-hf"
    HOST       default "127.0.0.1"
    PORT       default 8765
    LOAD_4BIT  default "1" (4-bit via bitsandbytes; set "0" for bf16)
    MAX_NEW_TOKENS default 256

Model is non-commercial (NVIDIA OneWay Noncommercial License) — local/personal use only.
"""

import asyncio
import base64
import binascii
import json
import os
import sys
import tempfile
import traceback

import websockets

MODEL_ID = os.environ.get("MODEL_ID", "nvidia/music-flamingo-hf")
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8765"))
LOAD_4BIT = os.environ.get("LOAD_4BIT", "1") != "0"
MAX_NEW_TOKENS = int(os.environ.get("MAX_NEW_TOKENS", "160"))

# The instruction we hand the model for every clip. Kept tight on purpose: Charlie
# wants something he can act on in one breath, not a paragraph.
DEFAULT_PROMPT = (
    "Listen to this short audio clip from a music studio and describe it for a DJ "
    "in ONE compact sentence (max ~35 words). Cover only: style/genre, approximate "
    "tempo in BPM, key or mode if audible, mood/energy, and the main sound(s). Do NOT "
    "use headings, bullet points, or section labels — just the single sentence. If it's "
    "only talking, silence, or noise, say that plainly instead."
)

# Populated by load_model() at startup.
_model = None
_processor = None
# One GPU, one generate at a time.
_infer_lock = asyncio.Lock()


def load_model():
    """Import transformers, load Music-Flamingo. Fails loudly with the fix if the
    AudioFlamingo3 class isn't in the installed transformers."""
    global _model, _processor
    import torch  # noqa: F401  (ensure torch present before transformers)

    try:
        from transformers import AudioFlamingo3ForConditionalGeneration, AutoProcessor
    except ImportError as e:
        sys.stderr.write(
            "\nERROR: this transformers build has no AudioFlamingo3ForConditionalGeneration.\n"
            "Music-Flamingo needs a recent transformers. Try:\n"
            "    uv pip install -U 'transformers @ git+https://github.com/huggingface/transformers'\n\n"
            f"(import error: {e})\n"
        )
        raise

    print(f"[music-flamingo] loading {MODEL_ID} (4bit={LOAD_4BIT}) ...", flush=True)
    import torch as _torch
    # Load every non-quantized layer (the audio encoder, norms, embeddings) uniformly
    # in bf16 so they agree with the bf16 audio inputs we feed in _describe_sync. Without
    # this, the encoder defaults to float32 and mismatches the bf16 features.
    kwargs = {"device_map": "auto", "dtype": _torch.bfloat16}
    if LOAD_4BIT:
        from transformers import BitsAndBytesConfig
        # Quantize the Qwen2.5 decoder to 4-bit (compute in bf16); encoder stays bf16.
        kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=_torch.bfloat16,
            bnb_4bit_use_double_quant=True,
        )

    _processor = AutoProcessor.from_pretrained(MODEL_ID)
    _model = AudioFlamingo3ForConditionalGeneration.from_pretrained(MODEL_ID, **kwargs)

    # The model keeps some encoder layers (norms) in fp32 by design while the rest load
    # bf16, so neither an all-fp32 nor an all-bf16 input satisfies every op — and the
    # audio embeddings are merged into the bf16 LLM embeds with masked_scatter_, which
    # does NOT auto-cast. So force the encoder + projector fully to bf16 (overriding the
    # kept-fp32 layers) and feed bf16 audio features (see _describe_sync): uniform bf16
    # end to end, and the scatter matches.
    inner = getattr(_model, "model", _model)
    for attr in ("audio_tower", "multi_modal_projector"):
        sub = getattr(inner, attr, None)
        if sub is not None:
            sub.to(_torch.bfloat16)
    _model.eval()
    print("[music-flamingo] model ready.", flush=True)


def _describe_sync(wav_path: str, prompt: str) -> str:
    """Blocking inference. Runs in a worker thread via asyncio.to_thread."""
    import torch

    conversation = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "audio", "path": wav_path},
            ],
        }
    ]
    inputs = _processor.apply_chat_template(
        conversation,
        tokenize=True,
        add_generation_prompt=True,
        return_dict=True,
    ).to(_model.device)

    # Match the bf16 encoder (see load_model): cast floating inputs (audio features) to
    # bf16; integer tensors (input_ids) stay as-is.
    for k in list(inputs.keys()):
        v = inputs[k]
        if torch.is_tensor(v) and torch.is_floating_point(v):
            inputs[k] = v.to(torch.bfloat16)

    with torch.inference_mode():
        outputs = _model.generate(**inputs, max_new_tokens=MAX_NEW_TOKENS)

    decoded = _processor.batch_decode(
        outputs[:, inputs["input_ids"].shape[1]:],
        skip_special_tokens=True,
    )
    return (decoded[0] if decoded else "").strip()


async def handle(websocket):
    peer = getattr(websocket, "remote_address", "?")
    print(f"[music-flamingo] client connected: {peer}", flush=True)
    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
                audio_b64 = msg.get("audio_b64")
                if not audio_b64:
                    await websocket.send(json.dumps({"error": "missing audio_b64"}))
                    continue
                # Always describe with the full default instruction; `focus` (if any)
                # is an ADD-ON, not a replacement. `prompt` is a full override escape hatch.
                prompt = (msg.get("prompt") or DEFAULT_PROMPT).strip()
                focus = (msg.get("focus") or "").strip()
                if focus and not msg.get("prompt"):
                    prompt = f"{prompt} Pay particular attention to {focus}."
                try:
                    wav_bytes = base64.b64decode(audio_b64, validate=True)
                except (binascii.Error, ValueError):
                    await websocket.send(json.dumps({"error": "audio_b64 is not valid base64"}))
                    continue

                with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tf:
                    tf.write(wav_bytes)
                    tf.flush()
                    async with _infer_lock:
                        description = await asyncio.to_thread(_describe_sync, tf.name, prompt)

                await websocket.send(json.dumps({"description": description}))
                print(f"[music-flamingo] -> {description[:120]!r}", flush=True)
            except Exception as e:  # one bad message shouldn't kill the connection
                traceback.print_exc()
                try:
                    await websocket.send(json.dumps({"error": str(e)}))
                except Exception:
                    pass
    except websockets.ConnectionClosed:
        pass
    finally:
        print(f"[music-flamingo] client disconnected: {peer}", flush=True)


async def main():
    load_model()
    async with websockets.serve(handle, HOST, PORT, max_size=16 * 1024 * 1024):
        print(f"[music-flamingo] ready on ws://{HOST}:{PORT}", flush=True)
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[music-flamingo] bye.", flush=True)
