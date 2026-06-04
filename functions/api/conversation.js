// Cloudflare Pages Function — POST /api/conversation
//
// Creates a Tavus conversation server-side so the browser never sees a Tavus
// API key. The persona (DJ Charlie, with the Studio tools + Cerebras LLM) is
// minted out-of-band by scripts/mint-persona.mjs and referenced here by id.
//
// Required env (set as Pages secrets / vars):
//   TAVUS_API_KEY — Tavus platform key, used to create the conversation
//   PERSONA_ID    — id of the pre-minted DJ Charlie persona
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export async function onRequestPost({ env }) {
  if (!env.TAVUS_API_KEY) return json({ error: 'Server is missing TAVUS_API_KEY.' }, 500);
  if (!env.PERSONA_ID) return json({ error: 'Server is missing PERSONA_ID.' }, 500);

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

  return json({
    conversation_url: body.conversation_url,
    conversation_id: body.conversation_id,
  });
}

// A bare GET is handy for a health check / friendly error in the browser.
export const onRequestGet = () =>
  json({ error: 'Use POST to create a conversation.' }, 405);
