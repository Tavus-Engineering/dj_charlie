# 🎧 DJ Charlie — Live Bytebeat

A Tavus replica that DJs **bytebeat** — music generated from a single one-line
JavaScript expression `f(t)`. Talk to Charlie and he composes and morphs
algorithmic music in real time, the same way the
[`diagnostics-embed`](../conversation-visualizer/diagnostics-embed) lets a replica
drive a diagnostics viewer.

Two static files do all the work:

| File | Role |
|---|---|
| `index.html` | The booth — Tavus conversation + Daily call + DJ Charlie video, a control deck, and the tool-call → player bridge. |
| `player.html` | A self-hosted bytebeat engine (AudioWorklet) embedded in an iframe. Driven live by the booth via `postMessage`; also loads beats from URL params standalone. |

The public bytebeat sites can't be remote-controlled (no postMessage API + autoplay
restrictions), so the player is self-hosted. See `bytebeat-syntax.txt` for the full
expression / URL / tool reference.

## Tracks (the mixer)

The **🎚 Mixer** panel layers multiple bytebeat voices that play **at the same
time** and are summed by the engine — a bass track, a kick, a hi-hat, a guitar, a
lead, etc. (distinct from the sequencer, which plays beats one-after-another).

- **Add** a track from an instrument template (`+ bass`, `+ kick`, `+ hi-hat`,
  `+ snare`, `+ guitar`, `+ lead`, `+ blank`) — each starts from an editable
  starter formula.
- Per-track strip: editable **name**, **expression**, **rate**, **mode**, **M**ute,
  **S**olo, and a **volume** slider. Edits apply live (expression changes crossfade
  in the engine, so no clicks).
- The mix auto-saves to `localStorage` (`djc-tracks`) and is restored on the next
  session.
- **DJ Charlie** lays down tracks by voice: `set_track({name, expr, …})` (he'll fire
  several at once — "give me a bass, a kick, a hat and a lead"), `remove_track`,
  `mute_track`, `clear_tracks`. The single deck beat / `set_beat` is the separate
  **lead** voice and mixes in alongside the tracks.

> Auto-mode: if an expression uses `sin`/`cos`/`tan` with no bitwise ops and no mode
> is given, it's treated as **floatbeat** automatically (so tonal voices sound right
> even when the mode is omitted).

## Saving beats & building songs

- **Save a formula** — the **💾 Save** button on the deck stores the current
  expression (with its rate + mode) to your **crate** in browser `localStorage`
  (`djc-crate`). Saved beats show up as purple chips in the **Saved** row; click to
  load, click the ✕ to delete. They persist across sessions and survive refreshes.
- **Sequence beats into a song** — the **Song** row is a step sequencer. Set a
  per-step duration, hit **+ Add** to append the current beat, then **▶ Play** to
  run the steps in order (each plays for its duration, crossfading into the next).
  **🔁 Loop** repeats the song; **Clear** empties it. **💾 Song** saves the whole
  arrangement to `localStorage` (`djc-songs`); reload it from the **Load song…**
  dropdown.
- **DJ Charlie does it too** — by voice. He has tools to `save_beat` ("save this as
  *dark bass*"), `play_sequence` ("build me an intro, a drop, then a breakdown, on
  loop"), and `stop_sequence`. Song steps can reference a saved/crate beat by name
  or supply a fresh expression. Every call shows up in the Tool Calls console.

## Run it locally

It's just static files served over HTTP (needed for the AudioWorklet + mic
permissions — opening `index.html` via `file://` will not work).

```bash
cd ~/repos/dj_charlie
npm start            # serves on http://localhost:5173 via `npx serve`
```

Then open **http://localhost:5173** in Chrome/Edge/Firefox.

Any static server works just as well, e.g.:

```bash
python3 -m http.server 5173      # http://localhost:5173
```

## First-time setup (in the app)

1. Paste your **Tavus API key** (from the [Tavus dashboard](https://platform.tavus.io)).
2. A pre-created DJ Charlie persona (`p8c22c833e43`, with the bytebeat tools
   defined) is filled in by default. To make your own, optionally set a **Replica
   ID** (defaults to the stock `r90bbd427f71`) then click **“+ Create Charlie”** —
   the new persona ID auto-fills and is saved to `localStorage`.
3. *(Optional)* type an **opening beat**, e.g. `t*(t>>5|t>>8)`.
4. **Start the Set.** When the player loads, **tap it once** to enable audio
   (browser autoplay rule), then talk to Charlie: *“give me something darker,”*
   *“play the crowd track,”* *“faster,” “drop it.”*

You can also drive it by hand from the control deck at the bottom (expression
box, sample rate, mode, presets, volume).

> **LLM:** DJ Charlie runs on **Cerebras-hosted Kimi K2** as a custom
> OpenAI-compatible LLM — `model: moonshotai-kimi-k2.6`,
> `base_url: https://api.cerebras.ai/v1`. The persona stores the Cerebras API
> key server-side (set via `.env` → `CEREBRAS_API_KEY` when creating/patching).
> Note: **Cerebras** (fast-inference API) is *not* Cerebrium (serverless-GPU
> platform) — and Kimi is not a Tavus-managed alias on Cerebras, hence the
> custom `base_url`/`api_key`. The custom-LLM path is handled by
> `request-handler` (`conversation_service.py`) and `realtime-replica`
> (`openai_compatible_llm.py`).

## Deploy

Static hosting — no build step. Point any of these at the repo root:

- **Vercel / Netlify / Cloudflare Pages / GitHub Pages** — drop the repo in, no
  config needed (`index.html` is the entry point).
- The Tavus conversation is created **client-side** with the user's own API key,
  so there's no backend.

> ⚠️ The API key is entered in the browser and stored in `localStorage` for
> convenience. This is fine for a personal/internal tool; for a public deployment,
> proxy conversation creation through a small backend so the key never reaches the
> client.

## How control flows

```
user speech ─▶ DJ Charlie (Tavus LLM) ─▶ conversation.tool_call (Daily app-message)
                                              │
              index.html onAppMessage ◀───────┘
                     │  set_beat / load_preset / stop_beat / set_volume
                     ▼
              postMessage ─▶ player.html (AudioWorklet) ─▶ 🔊
```

The booth feeds Charlie his tool instructions and the preset crate via
`conversation.append_llm_context`, and narrates state changes back to him the same
way — so he always knows what's currently playing.
