# 🎹 DJ Charlie — Live Studio

A Tavus replica that DJs in a **Studio** — 16 playable **pads**, an on-screen
**keyboard**, and a **piano-roll timeline**, all powered by
**[Tone.js](https://tonejs.github.io/)**. Talk to Charlie and he composes the
sounds, plays them, and arranges a beat in real time; you can also play and edit
everything by hand.

It deploys on **Cloudflare Pages** — a static front end plus one tiny Pages
Function that holds the keys server-side:

| Path | Role |
|---|---|
| `public/index.html` | The booth — Daily call + DJ Charlie video, the full-screen Studio, and the tool-call bridge that lets Charlie drive it. |
| `functions/api/conversation.js` | Pages Function. `POST /api/conversation` creates the Tavus conversation using a **server-held** `TAVUS_API_KEY` + `PERSONA_ID` — no secret ever reaches the browser. |
| `persona.json` | The DJ Charlie persona config (system prompt + Studio tool definitions). The `api_key` is a `<CEREBRAS_API_KEY>` placeholder, injected at mint time. |
| `scripts/mint-persona.mjs` | One-shot, run locally: mints/refreshes the persona on Tavus from `persona.json` and prints the `persona_id` to set as `PERSONA_ID`. |
| `wrangler.toml` | Pages project config (output dir `public/`, functions in `functions/`). |

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
- **Arrangement** — `set_bpm`, `set_bars` (loop length, 1–16), `create_note` /
  `create_notes`, `update_note`, `delete_note`, `clear_notes`,
  `play_timeline` / `stop_timeline`.

`create_note` returns a stable id (e.g. `n7`) so Charlie can edit or delete that
exact note later. Try: *“make pad 0 a punchy kick and pad 1 a bright lead, then
write a 4-bar bassline at 100 BPM and loop it,”* then *“move that last note later”*
or *“delete the third note.”*

> ⚠️ **Charlie needs the Studio tools.** Tool definitions are attached to a persona
> at creation time, so the deployed `PERSONA_ID` must point at a persona minted from
> this repo's `persona.json` (run `npm run mint-persona`). (Playing the pads,
> keyboard, and timeline **by hand** works regardless.)

## Run it locally

The page needs the backend (`/api/conversation`) and HTTPS-equivalent context
(AudioWorklet + mic) — so run it through Wrangler, which serves `public/` and the
Pages Function together:

```bash
cd ~/repos/dj_charlie
npm install                            # wrangler
cat > .dev.vars <<'VARS'               # gitignored
TAVUS_API_KEY="<your tavus key>"
PERSONA_ID="p235b2543f75"
DEV_BYPASS_ACCESS="1"
VARS
npm run dev                            # wrangler pages dev → http://localhost:8788
```

`.dev.vars` feeds the local Function its secrets. `DEV_BYPASS_ACCESS=1` skips the
Cloudflare Access gate (there's no Access JWT on localhost) — it lives **only**
in this local file and is never set on the deployed project, which stays gated.
Then open the printed URL in Chrome/Edge/Firefox.

### Minting the persona

The persona (DJ Charlie + the Studio tools, on the Cerebras LLM) is created
out-of-band, not from the browser. With `TAVUS_API_KEY` + `CEREBRAS_API_KEY` in
`.env`:

```bash
npm run mint-persona        # prints a persona_id → set it as PERSONA_ID
```

## Using it

1. **Start the Set** — the backend mints a conversation; no keys to paste.
2. **Tap a pad once** to enable audio, then talk to Charlie:
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

Hosted on **Cloudflare Pages** at **https://dj.tavus-preview.io**
(project `dj-charlie`). No build step — Pages serves `public/` and bundles the
Function in `functions/`.

```bash
# one-time
wrangler pages project create dj-charlie --production-branch main

# secrets the Function reads at runtime
wrangler pages secret put TAVUS_API_KEY --project-name dj-charlie
wrangler pages secret put PERSONA_ID    --project-name dj-charlie   # from `npm run mint-persona`

# deploy
npm run deploy        # wrangler pages deploy
```

The custom domain `dj.tavus-preview.io` is a proxied CNAME →
`dj-charlie.pages.dev` in the `tavus-preview.io` Cloudflare zone; Cloudflare provisions TLS.

Access is gated by **Cloudflare Access** (Zero Trust) on `dj.tavus-preview.io`,
restricted to `@tavus.io`. The Function also verifies the Access JWT, so the
`dj-charlie.pages.dev` hostname (which Access does not front) stays locked too.
Set on the Pages project: `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`, `ALLOWED_EMAIL_DOMAIN`.

> ✅ No secret reaches the browser — the Tavus key and persona id live only in the
> Function's environment. The Cerebras key lives only in the persona (server-side on
> Tavus) and in the local `.env` used by `mint-persona`; it's never shipped.

## How control flows

```
user speech ─▶ DJ Charlie (Tavus LLM) ─▶ conversation.tool_call (Daily app-message)
                                              │
              index.html onAppMessage ◀───────┘
                     │  define_pad(s) / trigger_pad / set_bpm / set_bars /
                     │  create_note(s) / update_note / play_timeline …
                     ▼
              Tone.js engine (synths + pitched-bytebeat worklet) ─▶ 🔊
```

The booth feeds Charlie his tool instructions via
`conversation.append_llm_context` and narrates state changes back to him, so he
always knows the kit and the arrangement he's working with.
