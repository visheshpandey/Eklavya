// Gemini Live voice client: WebSocket + mic capture (PCM16 16 kHz) + gap-free playback (PCM16 24 kHz) + barge-in.
// Gemini only: server problems arrive as {type:"error"} events and are shown, never replaced by other speech models.
//
// Sessions are numbered. Everything that happens later (a socket closing, a permission prompt being answered,
// a worklet loading) checks that its session is still the current one, so a slow leftover from an old session can
// never tear down a new one that is starting.
import { authToken } from '../lib/session.js';
import { WS_BASE } from '../lib/config.js';
import { VOICE_STATUS } from '../lib/protocol.js';

const PLAYBACK_RATE = 24000;
const CAPTURE_RATE = 16000;

/** A function that returns how loud `node` is right now (0-1), or null if this browser cannot measure it. */
function meter(ctx, node) {
  if (typeof ctx.createAnalyser !== 'function') return null;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  node.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const spectrum = new Uint8Array(analyser.frequencyBinCount);
  const band = (from, to) => { let sum = 0; for (let i = from; i < to; i += 1) sum += spectrum[i]; return sum / ((to - from) * 255); };
  const read = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    // where the energy sits (about 47 Hz per bin): low = round vowels (o, u), mid = open vowels (a), high = e, i and s, f: what the mouth shape follows
    analyser.getByteFrequencyData(spectrum);
    read.bands = { low: band(1, 11), mid: band(11, 43), high: band(43, 128) };
    return Math.min(1, Math.sqrt(sum / samples.length) * 4);   // speech RMS is small; x4 fills the 0-1 range
  };
  read.bands = { low: 0, mid: 0, high: 0 };
  return read;
}

/** Best-effort teardown: ignore errors, including a rejected promise (closing an already closed AudioContext rejects). */
const quiet = (fn) => {
  try {
    const result = fn();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch { /* already gone */ }
};

/** How long the microphone stays closed at the start of a call so the opening greeting is not cut off by its own echo. */
export const GREETING_GRACE_MS = 12000;

export class VoiceClient {
  /**
   * @param {{onEvent: (event: object) => void, onStatus: (status: string) => void, onLevel?: (level: number) => void}} handlers
   *   onLevel gets the loudness (0-1) of whoever is talking, about 60 times a second, for the orb animation.
   */
  constructor({ onEvent, onStatus, onLevel = () => {}, onAudio = () => {}, onInterrupt = () => {} }) {
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.onLevel = onLevel;
    this.onAudio = onAudio;           // each chunk of Eklavya's voice (PCM16 mono 24 kHz), for an avatar that speaks it
    this.onInterrupt = onInterrupt;   // the student barged in
    this.muted = false;
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
  async start({ userId = 1, lang = 'hinglish', mode = 'free', topicId = null, side = null, motion = '', style = 'tough', tutor = 'mentor', resume = false } = {}) {
    if (this.ws) return;
    this.userStopped = false;
    const resumeId = resume ? this.resumeId : null;   // pick the dropped call up where it was
    if (!resume) this.resumeId = null;
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
      const failure = new Error(err.name === 'NotAllowedError' ? 'Microphone permission was denied.' : `Could not start the microphone: ${err.message}`);
      failure.code = 'mic';   // the Study room carries on in text mode when there is no usable microphone
      throw failure;
    }

    let extra = topicId ? `&mode=${encodeURIComponent(mode)}&topic_id=${topicId}` : '';
    if (topicId && mode === 'debate') {
      extra += `&side=${side === 'against' ? 'against' : 'for'}&motion=${encodeURIComponent(motion)}&style=${style === 'friendly' ? 'friendly' : 'tough'}`;
    }
    const token = authToken();   // the server reads who you are from the token
    ws = new WebSocket(`${WS_BASE}/ws/voice?${token ? `token=${encodeURIComponent(token)}&` : ''}lang=${encodeURIComponent(lang)}&tutor=${tutor === 'senior' ? 'senior' : 'mentor'}${extra}${resumeId ? `&resume=${encodeURIComponent(resumeId)}` : ''}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onmessage = (message) => { if (this.ws === ws) this._onMessage(message); };
    ws.onclose = (closed) => {
      if (this.ws !== ws) return;   // an old socket closing late must not end a newer session
      const lost = !this.userStopped && closed?.code !== 1000;   // closed by the network or the server, not by the student
      this._cleanup();
      if (lost) this.onEvent({ type: 'connection_lost', code: closed?.code ?? 1006 });
    };

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
    // The tutor's opening line is spoken through the speakers, and a laptop microphone hears it: that sounds like the student talking, the
    // server treats it as an interruption, and the greeting is cut off after a few words ("Hello! Aaj hum"). So the microphone stays closed
    // until the first turn is complete, or GREETING_GRACE_MS has passed. A resumed call has no greeting to protect.
    this.micOpen = Boolean(resumeId);
    clearTimeout(this.micTimer);
    if (!this.micOpen) this.micTimer = setTimeout(() => { this.micOpen = true; }, GREETING_GRACE_MS);
    this.node.port.onmessage = (e) => { if (this.ws === ws && this.micOpen && ws.readyState === WebSocket.OPEN) ws.send(e.data); };
    source.connect(this.node);
    this.micMeter = meter(micCtx, source);
    this._setStatus(VOICE_STATUS.LISTENING);
    this._watchLevel(id);
  }

  /** Report who is talking and how loud, once per frame, until the session ends. */
  _watchLevel(id) {
    if (typeof requestAnimationFrame !== 'function') return;
    const tick = () => {
      if (this.session !== id) { this.onLevel(0); return; }
      const speaking = this.status === VOICE_STATUS.SPEAKING;
      const active = speaking ? this.playMeter : this.micMeter;
      this.onLevel(active?.() ?? 0, active?.bands);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Send typed text to the same Gemini session. */
  sendText(text) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;   // the caller keeps it and sends it again after reconnecting
    this.ws.send(JSON.stringify({ type: 'user_text', text }));
    return true;
  }

  /** Show Eklavya a photo during the call: {mime, data (base64)}. Returns false when no call is open. */
  sendPhoto({ mime, data, note = '' }) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type: 'photo', mime, data, note }));
    return true;
  }

  stop() {
    this.userStopped = true;
    if (this.ws?.readyState === WebSocket.OPEN) quiet(() => this.ws.send(JSON.stringify({ type: 'end' })));
    this._cleanup();
  }

  _onMessage(message) {
    if (typeof message.data !== 'string') { this._play(message.data); return; }
    let event;
    try { event = JSON.parse(message.data); } catch { return; }
    if (event.type === 'turn_complete') this.micOpen = true;   // the greeting (or any first turn) is finished: the student can speak
    if (event.type === 'interrupted') { this._flushPlayback(); this.onInterrupt(); }
    if (event.type === 'session') this.resumeId = event.id;   // lets a dropped call be picked up again
    this.onEvent(event);
  }

  /** Silence the speakers (another player, such as the photoreal avatar, is voicing the same audio). The level meter keeps working. */
  setPlaybackMuted(muted) {
    this.muted = muted;
    if (this.speaker) this.speaker.gain.value = muted ? 0 : 1;
  }

  _play(buffer) {
    if (!this.playCtx) return;
    this.onAudio(buffer);
    const int16 = new Int16Array(buffer, 0, Math.floor(buffer.byteLength / 2));
    const float32 = Float32Array.from(int16, (v) => v / 32768);
    const audio = this.playCtx.createBuffer(1, float32.length, PLAYBACK_RATE);
    audio.copyToChannel(float32, 0);
    const source = this.playCtx.createBufferSource();
    source.buffer = audio;
    if (!this.playOut) {   // one meter in front of the speakers measures Eklavya's voice for the orb
      this.playOut = this.playCtx.createGain ? this.playCtx.createGain() : this.playCtx.destination;
      if (this.playOut !== this.playCtx.destination) {
        this.speaker = this.playCtx.createGain();   // after the meter, so muting never flattens the level
        this.speaker.gain.value = this.muted ? 0 : 1;
        this.playOut.connect(this.speaker); this.speaker.connect(this.playCtx.destination);
      }
      this.playMeter = meter(this.playCtx, this.playOut);
    }
    source.connect(this.playOut);
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
    clearTimeout(this.micTimer);
    this.micOpen = false;
    this.session++;
    quiet(() => this.node?.disconnect());
    quiet(() => this.stream?.getTracks().forEach((t) => t.stop()));
    quiet(() => { if (this.ws && this.ws.readyState < WebSocket.CLOSING) this.ws.close(); });
    quiet(() => this.sources.forEach((s) => s.stop()));
    quiet(() => this.micCtx?.close());
    quiet(() => this.playCtx?.close());
    this.sources.clear();
    this.ws = this.node = this.stream = this.micCtx = this.playCtx = this.playOut = this.speaker = this.micMeter = this.playMeter = null;
    this._setStatus(VOICE_STATUS.IDLE);
  }
}
