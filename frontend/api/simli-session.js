// Vercel serverless function: mints a short-lived Simli session token so SIMLI_API_KEY never reaches the browser.
//   POST /api/simli-session   body {faceId?}   ->   { session_token }
// Set SIMLI_API_KEY (and optionally SIMLI_FACE_ID, SIMLI_MAX_SECONDS) in the Vercel project's environment variables. Without a key it answers 503 and the
// app quietly uses the 3D mentor instead.
const SIMLI_URL = 'https://api.simli.ai/compose/token';
const FACE_ID = /^[0-9a-f-]{8,64}$/i;

export default async function handler(request, response) {
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return response.status(405).json({ error: 'POST only' }); }
  const apiKey = process.env.SIMLI_API_KEY;
  if (!apiKey) return response.status(503).json({ error: 'photoreal avatar is not configured' });
  const requested = typeof request.body === 'object' && request.body ? request.body.faceId : undefined;
  const faceId = process.env.SIMLI_FACE_ID || requested;
  if (!faceId || !FACE_ID.test(faceId)) return response.status(400).json({ error: 'missing or invalid faceId' });
  try {
    const upstream = await fetch(SIMLI_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-simli-api-key': apiKey },
      body: JSON.stringify({ faceId, handleSilence: true, maxSessionLength: Number(process.env.SIMLI_MAX_SECONDS) || 600, maxIdleTime: 60 }),
    });
    if (!upstream.ok) return response.status(502).json({ error: `Simli answered ${upstream.status}` });
    const { session_token: sessionToken } = await upstream.json();
    response.setHeader('Cache-Control', 'no-store');
    return response.status(200).json({ session_token: sessionToken });
  } catch {
    return response.status(502).json({ error: 'could not reach Simli' });
  }
}
