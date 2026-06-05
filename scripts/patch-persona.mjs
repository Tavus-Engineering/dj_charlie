// One-shot: PATCH the existing DJ Charlie persona on Tavus in place, so its
// persona_id (and therefore the deployed PERSONA_ID Pages var) stays the same.
// Use this instead of mint-persona.mjs when you've only tweaked the prompt /
// tools / LLM settings and don't want to rewire PERSONA_ID.
//
//   node scripts/patch-persona.mjs          # reads keys + PERSONA_ID from .env
//   PERSONA_ID=pXXdeadbeef node scripts/patch-persona.mjs   # or override
//
// It syncs a fixed set of fields from persona.json onto the live persona via
// JSON Patch (RFC 6902). Tavus requires patch paths to match the CURRENT
// document shape, so we GET the persona first and pick `replace` (field exists)
// or `add` (field is new) per path. No-op fields are skipped; a 304 from Tavus
// just means nothing changed.
import { readFileSync } from 'node:fs';

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch { /* no .env — rely on real env */ }
  return env;
}

const env = loadEnv();
const TAVUS = env.TAVUS_API_KEY;
const PERSONA_ID = env.PERSONA_ID;
if (!TAVUS) { console.error('Missing TAVUS_API_KEY (in .env or env).'); process.exit(1); }
if (!PERSONA_ID) { console.error('Missing PERSONA_ID (in .env or env).'); process.exit(1); }

const persona = JSON.parse(readFileSync(new URL('../persona.json', import.meta.url), 'utf8'));

// The fields we keep in sync from persona.json → live persona. persona.json is
// the authoritative source for these — running this script makes the live
// persona match it. The tools array is included so tools added to persona.json
// (e.g. set_bars) reach the live persona without a re-mint. We do NOT patch
// layers.llm.api_key — the Cerebras key already lives on the persona and is
// never committed here. Heads up: because tools is a full replace, any tool that
// exists ONLY on the live persona (and not in persona.json) would be dropped —
// keep persona.json complete (it must list every tool the app handles).
// NOTE: parallel_tool_calls is an OpenAI-style request param, not a recognized
// persona LLM field — it must ride in extra_body (the provider passthrough).
// Patching it as a direct /layers/llm/parallel_tool_calls field returns HTTP 500.
const FIELDS = [
  { path: '/system_prompt',        value: persona.system_prompt },
  { path: '/layers/llm/tools',     value: persona.layers?.llm?.tools },
  { path: '/layers/llm/extra_body', value: persona.layers?.llm?.extra_body },
];

// Walk a JSON Pointer (RFC 6901) over the current persona to learn whether each
// target already exists (→ replace) or not (→ add), and to skip no-op writes.
function getAtPointer(obj, pointer) {
  let cur = obj;
  for (const raw of pointer.split('/').slice(1)) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur == null || typeof cur !== 'object' || !(key in cur)) return { found: false };
    cur = cur[key];
  }
  return { found: true, value: cur };
}

const getRes = await fetch(`https://tavusapi.com/v2/personas/${PERSONA_ID}`, {
  headers: { 'x-api-key': TAVUS },
});
const current = await getRes.json().catch(() => ({}));
if (!getRes.ok) {
  console.error('Could not fetch persona:', current.message || current.error || `HTTP ${getRes.status}`);
  process.exit(1);
}

const ops = [];
for (const { path, value } of FIELDS) {
  if (value === undefined) continue;            // not set in persona.json — leave the live value alone
  const { found, value: cur } = getAtPointer(current, path);
  if (found && JSON.stringify(cur) === JSON.stringify(value)) continue;  // already up to date
  ops.push({ op: found ? 'replace' : 'add', path, value });
}
// Heads up: Tavus normalizes the stored tools array (reorders keys, omits the
// function-level description in GET), so /layers/llm/tools never byte-matches
// persona.json and is re-sent every run — Tavus then answers 304 (no change).
// That's expected and harmless; it does NOT mean the patch failed.

if (!ops.length) {
  console.log(`Persona ${PERSONA_ID} already up to date — nothing to patch.`);
  process.exit(0);
}

console.log(`Patching ${PERSONA_ID}: ${ops.map(o => `${o.op} ${o.path}`).join(', ')}`);
const res = await fetch(`https://tavusapi.com/v2/personas/${PERSONA_ID}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', 'x-api-key': TAVUS },
  body: JSON.stringify(ops),
});
if (res.status === 304) { console.log('No changes (304).'); process.exit(0); }
if (!res.ok) {
  const body = await res.json().catch(() => ({}));
  console.error('Patch failed:', body.message || body.error || `HTTP ${res.status}`);
  process.exit(1);
}
console.log(`Patched persona ${PERSONA_ID}.`);
