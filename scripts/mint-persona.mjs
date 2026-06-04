// One-shot: mint (or refresh) the DJ Charlie persona on Tavus, then print the
// persona_id to set as the PERSONA_ID Pages var. Run locally — never deployed.
//
//   node scripts/mint-persona.mjs        # reads keys from .env
//
// Reads persona.json (the reference config) and injects the Cerebras key from
// the environment so no secret is committed.
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
const CEREBRAS = env.CEREBRAS_API_KEY;
if (!TAVUS) { console.error('Missing TAVUS_API_KEY (in .env or env).'); process.exit(1); }
if (!CEREBRAS) { console.error('Missing CEREBRAS_API_KEY (in .env or env).'); process.exit(1); }

const persona = JSON.parse(readFileSync(new URL('../persona.json', import.meta.url), 'utf8'));
delete persona._comment;
persona.layers = { ...persona.layers, llm: { ...persona.layers.llm, api_key: CEREBRAS } };

const res = await fetch('https://tavusapi.com/v2/personas', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': TAVUS },
  body: JSON.stringify(persona),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('Persona creation failed:', body.message || body.error || `HTTP ${res.status}`);
  process.exit(1);
}
console.log(body.persona_id);
