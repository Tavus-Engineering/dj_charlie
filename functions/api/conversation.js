// Cloudflare Pages Function — POST /api/conversation
//
// Creates a Tavus conversation server-side so the browser never sees a Tavus
// API key. Access is gated by Cloudflare Access: every request must carry a
// valid Access JWT (Cf-Access-Jwt-Assertion) for our application, which we
// verify cryptographically here. This holds even on the *.pages.dev hostname,
// which Access does not front — so direct calls there are rejected too.
//
// FAIL-CLOSED: if ACCESS_AUD / ACCESS_TEAM_DOMAIN are unset, the endpoint
// refuses every request. Configure Access first, then set those vars.
//
// Required env:
//   TAVUS_API_KEY        — Tavus platform key (creates the conversation)
//   PERSONA_ID           — id of the pre-minted DJ Charlie persona
//   ACCESS_TEAM_DOMAIN   — e.g. "tavus.cloudflareaccess.com"
//   ACCESS_AUD           — the Access application's Audience (AUD) tag
//   ALLOWED_EMAIL_DOMAIN — optional, e.g. "tavus.io" (extra allowlist)
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

// ── Cloudflare Access JWT verification (RS256 via Web Crypto) ────────────────
function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64urlToText = (s) => new TextDecoder().decode(b64urlToBytes(s));

let _jwks = { domain: null, keys: null, at: 0 };
async function getKeys(teamDomain) {
  const now = Date.now();
  if (_jwks.domain === teamDomain && _jwks.keys && now - _jwks.at < 3_600_000) return _jwks.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('could not fetch Access certs');
  const { keys } = await res.json();
  _jwks = { domain: teamDomain, keys, at: now };
  return keys;
}

async function verifyAccessJwt(token, teamDomain, expectedAud) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [h, p, sig] = parts;
  const header = JSON.parse(b64urlToText(h));
  const payload = JSON.parse(b64urlToText(p));

  const jwk = (await getKeys(teamDomain)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown signing key');
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`),
  );
  if (!ok) throw new Error('bad signature');

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('token expired');
  if (payload.nbf && payload.nbf > now + 60) throw new Error('token not yet valid');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(expectedAud)) throw new Error('audience mismatch');
  return payload; // { email, ... }
}

// The Access JWT arrives either as the injected header or the CF_Authorization
// cookie. On Pages the cookie is the reliable one.
function getAccessToken(request) {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? m[1] : null;
}

export async function onRequestPost({ request, env }) {
  if (!env.TAVUS_API_KEY) return json({ error: 'Server is missing TAVUS_API_KEY.' }, 500);
  if (!env.PERSONA_ID) return json({ error: 'Server is missing PERSONA_ID.' }, 500);

  // DEV_BYPASS_ACCESS skips the Access gate for `wrangler pages dev` on
  // localhost (where there is no Access JWT). Set it ONLY in the local,
  // gitignored .dev.vars — it is never set on the deployed project.
  if (env.DEV_BYPASS_ACCESS !== '1') {
    // Fail closed: no Access config → no access.
    if (!env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN) {
      return json({ error: 'Access control is not configured; conversation creation is disabled.' }, 503);
    }
    const token = getAccessToken(request);
    if (!token) return json({ error: 'Unauthorized.' }, 401);

    let claims;
    try {
      claims = await verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
    } catch (err) {
      return json({ error: 'Unauthorized: ' + err.message }, 401);
    }
    const allow = (env.ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase();
    if (allow && !String(claims.email || '').toLowerCase().endsWith('@' + allow)) {
      return json({ error: 'Forbidden.' }, 403);
    }
  }

  let res;
  try {
    res = await fetch('https://tavusapi.com/v2/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.TAVUS_API_KEY },
      body: JSON.stringify({ persona_id: env.PERSONA_ID }),
    });
  } catch (err) {
    return json({ error: 'Failed to reach Tavus: ' + err.message }, 502);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json({ error: body.message || body.error || `Tavus HTTP ${res.status}` }, res.status);
  }
  if (!body.conversation_url) return json({ error: 'No conversation_url in Tavus response.' }, 502);

  return json({ conversation_url: body.conversation_url, conversation_id: body.conversation_id });
}

// A bare GET is handy for a health check / friendly error in the browser.
export const onRequestGet = () => json({ error: 'Use POST to create a conversation.' }, 405);
