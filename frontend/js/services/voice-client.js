// Gemini Live voice client: WebSocket + mic capture (PCM16 16 kHz) + gap-free playback (PCM16 24 kHz) + barge-in.
// Gemini only: server problems arrive as {type:"error"} events and are shown, never replaced by other speech models.
//
// Sessions are numbered. Everything that happens later (a socket closing, a permission prompt being answered,
// a worklet loading) checks that its session is still the current one, so a slow leftover from an old session can
// never tear down a new one that is starting.
import { WS_BASE } from '../lib/config.js';
import { VOICE_STATUS } from '../lib/protocol.js';

const PLAYBACK_RATE = 24000;
const CAPTURE_RATE = 16000;

/** Best-effort teardown: ignore errors, including a rejected promise (closing an already closed AudioContext rejects). */
const quiet = (fn) => {
  try {
    const result = fn();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch { /* already gone */ }
};

export class VoiceClient {
  /**
   * @param {{onEvent: (event: object) => void, onStatus: (status: string) => void}} handlers
   */
  constructor({ onEvent, onStatus }) {
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.status = VOICE_STATUS.IDLE;
    this.ws = null;
    this.session = 0;           // bumped by every cleanup; a start that sees a different number was cancelled
    this.sources = new Set();
    this.nextTime = 0;
  }

  _setStatus(status) {
    if (status === this.status) return;
    this.status = status;
    this.onStatus(status);
  }

  /**
   * Open the mic and the WebSocket. Rejects with a readable Error if either fails.
   * Resolves quietly (and releases everything) if stop() is called while it is still starting.
   */
  async start({ userId = 1, lang = 'hinglish', mode = 'free', topicId = null } = {}) {
    if (this.ws) return;
    const id = ++this.session;       // starting a new session cancels any start that is still waiting
    const current = () => this.session === id;
    this._setStatus(VOICE_STATUS.CONNECTING);

    // audio contexts must be created from the click that started the session
    const playCtx = new AudioContext({ sampleRate: PLAYBACK_RATE });
    const micCtx = new AudioContext({ sampleRate: CAPTURE_RATE });
    this.playCtx = playCtx;
    this.micCtx = micCtx;
    this.nextTime = 0;
    let stream = null;
    let ws = null;
    const release = () => {   // free what THIS start created, whatever the instance fields now point to
      quiet(() => stream?.getTracks().forEach((t) => t.stop()));
      quiet(() => { if (ws && ws.readyState < WebSocket.CLOSING) ws.close(); });
      quiet(() => micCtx.close());
      quiet(() => playCtx.close());
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!current()) { release(); return; }
      this.stream = stream;
      await micCtx.audioWorklet.addModule(new URL('./audio-worklet.js', import.meta.url));
      if (!current()) { release(); return; }
    } catch (err) {
      if (!current()) { release(); return; }
      release();
      this._cleanup();
      throw new Error(err.name === 'NotAllowedError' ? 'Microphone permission was denied.' : `Could not start the microphone: ${err.message}`);
    }

    const extra = topicId ? `&mode=${encodeURIComponent(mode)}&topic_id=${topicId}` : '';
    ws = new WebSocket(`${WS_BASE}/ws/voice?user_id=${userId}&lang=${encodeURIComponent(lang)}${extra}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onmessage = (message) => { if (this.ws === ws) this._onMessage(message); };
    ws.onclose = () => { if (this.ws === ws) this._cleanup(); };   // an old socket closing late must not end a newer session

    try {
      await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', () => reject(new Error('Voice connection failed. Is the backend running?')), { once: true });
      });
    } catch (err) {
      if (current()) { release(); this._cleanup(); }
      throw err;
    }
    if (!current()) { release(); return; }

    const source = micCtx.createMediaStreamSource(stream);
    this.node = new AudioWorkletNode(micCtx, 'pcm-capture');
    this.node.port.onmessage = (e) => { if (this.ws === ws && ws.readyState === WebSocket.OPEN) ws.send(e.data); };
    source.connect(this.node);
    this._setStatus(VOICE_STATUS.LISTENING);
  }

  /** Send typed text to the same Gemini session. */
  sendText(text) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'user_text', text }));
  }

  stop() {
    if (this.ws?.readyState === WebSocket.OPEN) quiet(() => this.ws.send(JSON.stringify({ type: 'end' })));
    this._cleanup();
  }

  _onMessage(message) {
    if (typeof message.data !== 'string') { this._play(message.data); return; }
    let event;
    try { event = JSON.parse(message.data); } catch { return; }
    if (event.type === 'interrupted') this._flushPlayback();
    this.onEvent(event);
  }

  _play(buffer) {
    if (!this.playCtx) return;
    const int16 = new Int16Array(buffer, 0, Math.floor(buffer.byteLength / 2));
    const float32 = Float32Array.from(int16, (v) => v / 32768);
    const audio = this.playCtx.createBuffer(1, float32.length, PLAYBACK_RATE);
    audio.copyToChannel(float32, 0);
    const source = this.playCtx.createBufferSource();
    source.buffer = audio;
    source.connect(this.playCtx.destination);
    const startAt = Math.max(this.playCtx.currentTime + 0.02, this.nextTime);
    source.start(startAt);
    this.nextTime = startAt + audio.duration;
    this.sources.add(source);
    this._setStatus(VOICE_STATUS.SPEAKING);
    source.onended = () => {
      this.sources.delete(source);
      if (!this.sources.size && this.status === VOICE_STATUS.SPEAKING) this._setStatus(VOICE_STATUS.LISTENING);
    };
  }

  /** Barge-in: the student started talking, so drop everything queued. */
  _flushPlayback() {
    this.sources.forEach((s) => quiet(() => s.stop()));
    this.sources.clear();
    this.nextTime = 0;
    if (this.status === VOICE_STATUS.SPEAKING) this._setStatus(VOICE_STATUS.LISTENING);
  }

  /** End the current session (and cancel a start that is still waiting). */
  _cleanup() {
    this.session++;
    quiet(() => this.node?.disconnect());
    quiet(() => this.stream?.getTracks().forEach((t) => t.stop()));
    quiet(() => { if (this.ws && this.ws.readyState < WebSocket.CLOSING) this.ws.close(); });
    quiet(() => this.sources.forEach((s) => s.stop()));
    quiet(() => this.micCtx?.close());
    quiet(() => this.playCtx?.close());
    this.sources.clear();
    this.ws = this.node = this.stream = this.micCtx = this.playCtx = null;
    this._setStatus(VOICE_STATUS.IDLE);
  }
}
