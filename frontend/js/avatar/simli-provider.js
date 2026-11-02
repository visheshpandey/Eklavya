// Photoreal mentor: Simli's real-time avatar (a WebRTC video of a real-looking face that lip-syncs to the audio we send it). The API key never reaches
// the browser: a small serverless endpoint (api/simli-session.js, on Vercel) mints a short-lived session token. Eklavya's own voice (the Gemini audio the
// call already plays) is resampled to the 16 kHz mono PCM that Simli wants and sent as it arrives, so the face speaks English, Hindi and Hinglish alike.
// The session is closed when the call ends, when the Study room is left, or after IDLE_MS without audio, to save credits.
export const CONNECT_TIMEOUT_MS = 5000;
export const IDLE_MS = 60000;
const SOURCE_RATE = 24000, SIMLI_RATE = 16000;

/** PCM16 mono at 24 kHz -> PCM16 mono at 16 kHz (linear interpolation; speech survives it unharmed). */
export function resampleTo16k(buffer, fromRate = SOURCE_RATE) {
  const input = new Int16Array(buffer.buffer ?? buffer, buffer.byteOffset ?? 0, Math.floor((buffer.byteLength ?? 0) / 2));
  const ratio = fromRate / SIMLI_RATE;
  const length = Math.floor(input.length / ratio);
  const output = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const position = i * ratio, index = Math.floor(position), fraction = position - index;
    const a = input[index], b = input[Math.min(index + 1, input.length - 1)];
    output[i] = a + (b - a) * fraction;
  }
  return new Uint8Array(output.buffer);
}

export class SimliProvider {
  name = 'photoreal';

  constructor({ faceId, tokenUrl = '/api/simli-session', onLost = () => {}, fetchImpl = globalThis.fetch?.bind(globalThis) }) {
    Object.assign(this, { faceId, tokenUrl, onLost, fetchImpl });
    this.client = null;
    this.idleTimer = null;
    this.state = 'idle';
    this.alive = false;
  }

  async init(container) {
    if (!this.faceId) throw new Error('no Simli face id in config.js');
    this.video = Object.assign(document.createElement('video'), { autoplay: true, playsInline: true, muted: true, className: 'simli-video' });
    this.audio = Object.assign(document.createElement('audio'), { autoplay: true });
    container.append(this.video, this.audio);
    const deadline = Date.now() + CONNECT_TIMEOUT_MS;   // one 5 s budget for the whole connection: the token request and the WebRTC start together
    const response = await this.fetchImpl(this.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ faceId: this.faceId }), signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`session endpoint answered ${response.status}`);
    const { session_token: token } = await response.json();
    if (!token) throw new Error('no session token');
    const { SimliClient, LogLevel } = await import('../../vendor/simli.js');
    this.client = new SimliClient(token, this.video, this.audio, null, LogLevel.ERROR);
    this.client.on('stop', () => { if (this.alive) { this.alive = false; this.onLost('stopped'); } });
    this.client.on('error', () => { if (this.alive) { this.alive = false; this.onLost('error'); } });
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`did not connect within ${CONNECT_TIMEOUT_MS / 1000}s`)), Math.max(500, deadline - Date.now())); });
    try { await Promise.race([this.client.start(), timeout]); } finally { clearTimeout(timer); }
    this.alive = true;
    this.video.muted = false;
    this.armIdle();
  }

  armIdle() { clearTimeout(this.idleTimer); this.idleTimer = setTimeout(() => { if (this.alive) { this.alive = false; this.onLost('idle'); } }, IDLE_MS); }

  /** `chunk`: PCM16 mono at 24 kHz (what the voice client receives) as ArrayBuffer or Int16Array/Uint8Array. */
  speak(chunk) {
    if (!this.alive || !chunk) return;
    this.armIdle();
    this.client.sendAudioData(resampleTo16k(chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : chunk));
  }

  setState(state) { this.state = state; }   // the face keeps its own idle motion; nothing to drive
  setLevel() {}
  interrupt() { try { this.client?.ClearBuffer(); } catch { /* the session may already be gone */ } }

  async destroy() {
    this.alive = false;
    clearTimeout(this.idleTimer);
    try { await this.client?.stop(); } catch { /* already closed */ }
    this.video?.remove(); this.audio?.remove();
    this.client = null;
  }
}
