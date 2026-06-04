// Generates env.js (gitignored) from .env so the static page can read the
// Cerebras key without bundling a secret into committed source. Run by the
// `start`/`dev` npm scripts. Safe to run with no .env — emits an empty key.
const fs = require('fs');

let key = '';
try {
  const env = fs.readFileSync('.env', 'utf8');
  key = ((env.match(/^CEREBRAS_API_KEY=(.+)$/m) || [])[1] || '').trim()
    .replace(/^['"]|['"]$/g, ''); // strip surrounding quotes if .env wraps the value
} catch (_) { /* no .env — leave key empty */ }

fs.writeFileSync('env.js', `// AUTO-GENERATED from .env by gen-env.js — do not edit or commit.\nwindow.CEREBRAS_API_KEY = ${JSON.stringify(key)};\n`);
console.error(key ? 'gen-env.js: CEREBRAS_API_KEY → env.js' : 'gen-env.js: no CEREBRAS_API_KEY in .env (env.js written empty)');
