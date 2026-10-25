// Gemini Live voice client: WebSocket + mic capture (PCM16 16 kHz) + gap-free playback (PCM16 24 kHz) + barge-in.
// Gemini only: errors from the server arrive as {type:"error"} and are shown, never replaced by other speech models.
import { WS_BASE } from './api.js';

export class VoiceClient {
  constructor({ onEvent, onState }) {
    this.onEvent = onEvent;     // every JSON event from the server
    this.onState = onState;     // 'idle' | 'connecting' | 'listening' | 'speaking'
    this.ws = null;
    this.state = 'idle';
  }

  _set(state) { this.state = state; this.onState(state); }

  async start({ userId = 1, lang = 'hinglish' } = {}) {
    if (this.ws) return;
    this._set('connecting');
    // audio contexts must be created from the click that started the session
    this.playCtx = new AudioContext({ sampleRate: 24000 });
    this.nextTime = 0;
    this.sources = new Set();
    this.micCtx = new AudioContext({ sampleRate: 16000 });
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      await this.micCtx.audioWorklet.addModule(new URL('./audio-worklet.js', import.meta.url));
    } catch (e) {
      this._cleanup();
      throw new Error(e.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Could not start the microphone: ' + e.message);
    }

    this.ws = new WebSocket(`${WS_BASE}/ws/voice?user_id=${userId}&lang=${encodeURIComponent(lang)}`);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onmessage = (m) => this._onMessage(m);
    this.ws.onclose = () => { this._cleanup(); };
    this.ws.onerror = () => this.onEvent({ type: 'error', message: 'Voice connection failed. Is the backend running?' });
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true });
      this.ws.addEventListener('error', () => rej(new Error('Voice connection failed. Is the backend running?')), { once: true });
    }).catch((e) => { this._cleanup(); throw e; });

    const src = this.micCtx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.micCtx, 'pcm-capture');
    this.node.port.onmessage = (e) => { if (this.ws && this.ws.readyState === 1) this.ws.send(e.data); };
    src.connect(this.node);
    this._set('listening');
  }

  sendText(text) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ type: 'user_text', text }));
  }

  stop() {
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify({ type: 'end' })); } catch { /* closing anyway */ }
    }
    this._cleanup();
  }

  _onMessage(m) {
    if (typeof m.data !== 'string') { this._play(m.data); return; }
    let ev;
    try { ev = JSON.parse(m.data); } catch { return; }
    if (ev.type === 'interrupted') this._flush();
    this.onEvent(ev);
  }

  _play(buf) {
    const i16 = new Int16Array(buf, 0, Math.floor(buf.byteLength / 2));
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
    const ab = this.playCtx.createBuffer(1, f32.length, 24000);
    ab.copyToChannel(f32, 0);
    const s = this.playCtx.createBufferSource();
    s.buffer = ab;
    s.connect(this.playCtx.destination);
    const at = Math.max(this.playCtx.currentTime + 0.02, this.nextTime);
    s.start(at);
    this.nextTime = at + ab.duration;
    this.sources.add(s);
    this._set('speaking');
    s.onended = () => {
      this.sources.delete(s);
      if (!this.sources.size && this.state === 'speaking') this._set('listening');
    };
  }

  _flush() {   // barge-in: the student started talking, drop everything queued
    this.sources.forEach((s) => { try { s.stop(); } catch { /* already ended */ } });
    this.sources.clear();
    this.nextTime = 0;
    if (this.state === 'speaking') this._set('listening');
  }

  _cleanup() {
    try { this.node && this.node.disconnect(); } catch { /* ignore */ }
    try { this.stream && this.stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { this.ws && this.ws.readyState < 2 && this.ws.close(); } catch { /* ignore */ }
    try { this.micCtx && this.micCtx.close(); } catch { /* ignore */ }
    try { this.playCtx && this.sources && this.sources.forEach((s) => s.stop()); this.playCtx && this.playCtx.close(); } catch { /* ignore */ }
    this.ws = this.node = this.stream = this.micCtx = this.playCtx = null;
    if (this.state !== 'idle') this._set('idle');
  }
}
