#!/usr/bin/env python3
"""Smoke test: synthesize a short musical clip, send it to the running server,
print the description. Usage: python smoke_test.py [ws://127.0.0.1:8765]"""
import asyncio, base64, io, json, sys, math, struct
import websockets

URL = sys.argv[1] if len(sys.argv) > 1 else "ws://127.0.0.1:8765"
SR = 16000
DUR = 6.0


def make_wav() -> bytes:
    # A simple 120-BPM-ish arpeggio (A minor: A3, C4, E4) so the model has real musical content.
    notes = [220.0, 261.63, 329.63, 261.63]
    n = int(SR * DUR)
    samples = []
    for i in range(n):
        t = i / SR
        note = notes[int(t * 2) % len(notes)]      # change note every 0.5s (~120 BPM eighths)
        env = math.exp(-(t % 0.5) * 6)              # plucky decay each note
        s = 0.5 * env * math.sin(2 * math.pi * note * t)
        samples.append(max(-1.0, min(1.0, s)))
    buf = io.BytesIO()
    buf.write(b"RIFF"); buf.write(struct.pack("<I", 36 + n * 2)); buf.write(b"WAVE")
    buf.write(b"fmt "); buf.write(struct.pack("<IHHIIHH", 16, 1, 1, SR, SR * 2, 2, 16))
    buf.write(b"data"); buf.write(struct.pack("<I", n * 2))
    for s in samples:
        buf.write(struct.pack("<h", int(s * 32767)))
    return buf.getvalue()


async def main():
    wav_b64 = base64.b64encode(make_wav()).decode()
    print(f"connecting to {URL} ...")
    async with websockets.connect(URL, max_size=16 * 1024 * 1024) as ws:
        await ws.send(json.dumps({"audio_b64": wav_b64}))
        print("sent clip, awaiting description (model inference)...")
        reply = json.loads(await asyncio.wait_for(ws.recv(), timeout=120))
        print("\n--- server reply ---")
        print(json.dumps(reply, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
