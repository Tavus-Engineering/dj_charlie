# 🎹 DJ Charlie — Live Studio

A Tavus replica that DJs in a **Studio** — 16 playable **pads**, an on-screen
**keyboard**, and a **piano-roll timeline**, all powered by
**[Tone.js](https://tonejs.github.io/)**. Talk to Charlie and he composes the
sounds, plays them, and arranges a beat in real time; you can also play and edit
everything by hand.

A single static file does all the work:

| File | Role |
|---|---|
| `index.html` | The booth — Tavus conversation + Daily call + DJ Charlie video, the full-screen Studio, and the tool-call bridge that lets Charlie drive it. |

`persona.json` is a reference copy of the DJ Charlie persona (system prompt +
the Studio tool definitions); the in-app **“+ Create Charlie”** button posts an
equivalent body to the Tavus API.

## 🎛 The Studio

The Studio fills the screen during a set. Three sections, top to bottom:

### Pads — the instruments

- **16 pads** in a 4×4 grid. Each pad holds one *sound*, which is **either** a
  Tone.js synth (`MembraneSynth` kick, `MetalSynth` hat, `NoiseSynth` snare/clap,
  `FM`/`AMSynth` leads, `PluckSynth`, `Synth`) **or** a **bytebeat** expression.
- **Tap** a pad to play it; tapping also **selects** it for the keyboard. The **✎**
  corner opens the editor: kind (synth / bytebeat), synth type or expression,
  ADSR envelope, volume, and base note.
- Pads persist to `localStorage` (`djc-pads`); a small starter kit is seeded on
  first run. The first tap also unlocks the Studio audio (browser autoplay rule).

> **Bytebeat pads** are a per-sample expression in terms of `t` (**seconds** since
> note-on), `f` (the note's frequency in Hz), `sr` (sample rate), and `i` (sample
> index). Write **pitched** sounds in terms of `f`, e.g. `sin(2*PI*f*t)*0.6`;
> **drums ignore `f`**, e.g. a kick `sin(2*PI*60*t)*exp(-t*8)`. A
> `Tone.AmplitudeEnvelope` gives every note its attack/release.

### Keyboard

A chromatic on-screen keyboard plays the **selected** pad across pitches; the
`− 4 +` control shifts octave. Great for auditioning a pad melodically.

### Timeline — the piano-roll

Set a **BPM** and a **bars** loop length, then click in the grid to drop notes
(drag to move/re-pitch, drag the right edge to resize, double-click to delete).
**▶ Play** loops the arrangement. Each note references a pad + pitch +
start/length (in **beats**) and persists to `localStorage` (`djc-roll`).

## DJ Charlie does it all by voice

Charlie drives the Studio with tool calls (every call shows in the **Tool Calls**
console):

- **Sounds** — `define_pad` (one pad) and `define_pads` (a whole kit at once),
  `trigger_pad` (audition), `clear_pad`.
- **Arrangement** — `set_bpm`, `create_note` / `create_notes`, `update_note`,
  `delete_note`, `clear_notes`, `play_timeline` / `stop_timeline`.

`create_note` returns a stable id (e.g. `n7`) so Charlie can edit or delete that
exact note later. Try: *“make pad 0 a punchy kick and pad 1 a bright lead, then
write a 4-bar bassline at 100 BPM and loop it,”* then *“move that last note later”*
or *“delete the third note.”*

> ⚠️ **Charlie needs the Studio tools.** Tool definitions are attached to a persona
> at creation time, so an older persona won't have them — click **“+ Create Charlie”**
> on the start screen once to mint a persona with Studio control. (Playing the pads,
> keyboard, and timeline **by hand** works with any persona.)

## Run it locally

It's a static file served over HTTP (needed for the AudioWorklet + mic
permissions — opening `index.html` via `file://` will not work).

```bash
cd ~/repos/dj_charlie
npm start            # serves on http://localhost:5173 via `npx serve`
# or:  python3 -m http.server 5173
```

Then open **http://localhost:5173** in Chrome/Edge/Firefox.

## First-time setup (in the app)

1. Paste your **Tavus API key** (from the [Tavus dashboard](https://platform.tavus.io)).
2. Optionally set a **Replica ID** (defaults to the stock `r90bbd427f71`), then click
   **“+ Create Charlie”** to mint a persona with the Studio tools — the new persona ID
   auto-fills and is saved to `localStorage`.
3. **Start the Set.** **Tap a pad once** to enable audio, then talk to Charlie:
   *“give me a trap kit,”* *“make the lead warmer,”* *“write a bassline and loop it,”*
   *“add a snare on the off-beats.”*

> **LLM:** DJ Charlie runs on **Cerebras-hosted Kimi K2** as a custom
> OpenAI-compatible LLM — `model: moonshotai-kimi-k2.6`,
> `base_url: https://api.cerebras.ai/v1`. The persona stores the Cerebras API
> key server-side (set via `.env` → `CEREBRAS_API_KEY` when creating). Note:
> **Cerebras** (fast-inference API) is *not* Cerebrium (serverless-GPU platform).

## Talking to Charlie — a primer of terms

Charlie doesn't need exact words — these phrases just map cleanly onto what the
Studio can do. Mix and match.

### Compose sounds (pads)

- **“make pad 0 a punchy kick”** → defines one pad's instrument
- **“give me a full drum kit / a set of sounds”** → composes a whole bank of pads at once
- **“make pad 5 a bright lead / warm bass / plucky”** → picks a synth + envelope to match
- **“play pad 3” · “clear pad 7”** → auditions / empties a pad

### Sound flavors

Each pad is a Tone.js synth or a pitched bytebeat expression:

| Synth | Good for |
|---|---|
| `MembraneSynth` | kicks, toms |
| `MetalSynth` | hats, cymbals |
| `NoiseSynth` | snares, claps |
| `FMSynth` / `AMSynth` | rich leads, basses, stabs |
| `PluckSynth` | plucky strings |
| `Synth` | basic tone |
| **bytebeat `f(t)`** | glitchy / 8-bit timbres, written in `t`, `f` |

Descriptive words steer the envelope + synth choice: **punchy, boomy, clicky,
metallic, warm, bright, plucky, glitchy/8-bit.**

### Arrange a beat (timeline)

- **“write a 4-bar bassline at 100 BPM”** → sets tempo + drops notes
- **“four-on-the-floor kick, off-beat hats”** → lays a drum pattern across pads
- **“play / loop it” · “stop”** → runs / stops the arrangement
- **“move / shorten / delete that note” · “clear the hats”** → edits notes by id, or clears a pad

### Play it yourself

- **Tap a pad** to play its sound (and select it for the keyboard).
- **Keyboard** plays the selected pad; `− 4 +` shifts octave.
- **Timeline**: click to add a note, drag to move/resize, double-click to delete.

> **Tip:** comparative tweaks work best once a pad is playing — *“punchier,”*
> *“brighter,”* *“more swing,”* *“now add a snare.”*

## Deploy

Static hosting — no build step. Drop the repo into **Vercel / Netlify /
Cloudflare Pages / GitHub Pages** (entry point `index.html`). The Tavus
conversation is created **client-side** with the user's own API key, so there's
no backend.

> ⚠️ The API key is entered in the browser and stored in `localStorage` for
> convenience. Fine for a personal/internal tool; for a public deployment, proxy
> conversation creation through a small backend so the key never reaches the client.

## How control flows

```
user speech ─▶ DJ Charlie (Tavus LLM) ─▶ conversation.tool_call (Daily app-message)
                                              │
              index.html onAppMessage ◀───────┘
                     │  define_pad(s) / trigger_pad / set_bpm /
                     │  create_note(s) / update_note / play_timeline …
                     ▼
              Tone.js engine (synths + pitched-bytebeat worklet) ─▶ 🔊
```

The booth feeds Charlie his tool instructions via
`conversation.append_llm_context` and narrates state changes back to him, so he
always knows the kit and the arrangement he's working with.
