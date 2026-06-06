# Local audio understanding (Music-Flamingo)

Gives DJ Charlie **ears for music**. The browser taps the Daily room mic, keeps a
rolling 10-second buffer, and ships a clip here whenever Charlie calls the
`analyze_audio` tool. This service runs [NVIDIA Music-Flamingo](https://huggingface.co/nvidia/music-flamingo-hf)
(8B; Audio Flamingo 3 encoder + Qwen2.5-7B) and returns a short musical description
(genre, ~BPM, key, mood, instruments) that the browser injects into Charlie's LLM
context so he can make grounded suggestions.

This is a **music-understanding** model, not speech recognition — point it at humming,
beatboxing, an instrument, or a reference track, not at someone talking.

## Requirements

- An NVIDIA GPU. The 8B model is loaded **4-bit** (bitsandbytes) to fit ~6–7 GB and run
  comfortably on a 16 GB card (e.g. RTX 4090 Laptop). Set `LOAD_4BIT=0` for bf16 if you
  have ≥24 GB.
- `torch` with CUDA. `run.sh` uses `uv venv --system-site-packages` so a system
  CUDA torch is visible; if `uv` still resolves a fresh `torch` into the venv it pulls
  the CUDA build (verified: `torch 2.12.0+cu130`, `cuda.is_available() == True`).
- `uv` and ~16 GB free disk for the weights (downloaded on first run).

## Run

```bash
cd local-audio
./run.sh
```

It creates a venv, installs deps, verifies the `AudioFlamingo3` class is present (and
prints the `git+` fix if not), then starts the WebSocket server. When you see:

```
[music-flamingo] ready on ws://127.0.0.1:8765
```

…start the app locally (`npx wrangler pages dev` from the repo root) and the browser will
connect automatically when Charlie first calls `analyze_audio`.

## Config (env vars)

| Var | Default | Notes |
|---|---|---|
| `MODEL_ID` | `nvidia/music-flamingo-hf` | HF model id |
| `HOST` | `127.0.0.1` | bind host |
| `PORT` | `8765` | must match `AUDIO_WS_URL` in the frontend |
| `LOAD_4BIT` | `1` | `0` = bf16 (needs ≥24 GB VRAM) |
| `MAX_NEW_TOKENS` | `256` | description length cap |

## Protocol

One JSON text frame each way over the WebSocket:

```
client -> { "prompt": "<optional override>", "audio_b64": "<base64 16kHz mono WAV>" }
server -> { "description": "..." }   # success
server -> { "error": "..." }         # failure
```

## License

Music-Flamingo is under the **NVIDIA OneWay Noncommercial License** — research/personal
use only. Do not use this service in a commercial deployment.
