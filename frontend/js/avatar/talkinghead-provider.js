// The realistic 3D mentor: TalkingHead.js (a three.js avatar with blinking, breathing, head sway, eye contact and ARKit/Oculus blendshapes) driving a
// MetaPerson/ARKit GLB. The avatar file is named in config.js (mentorModel); until you supply yours, the compressed sample in assets/avatar is used.
// Eklavya's voice is played by the call itself, so TalkingHead is not given the audio: the mouth follows the loudness of that audio (the same 0-1 level that
// drives the orb), which works for English, Hindi and Hinglish because it follows the sound, not the words. (Word timings do not exist for a live voice
// stream, so TalkingHead's own viseme lip-sync is not used.)
const RESTING = { mouthSmile: 0.14, browInnerUp: 0.06, browDownLeft: 0, browDownRight: 0 };   // friendly and relaxed, never frowning
const VIEW = { cameraY: 0.0, cameraDistance: -1.0 };   // head and shoulders, centred
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export class TalkingHeadProvider {
  name = '3d';

  constructor({ url, reduceMotion = false }) { Object.assign(this, { url, reduceMotion }); this.state = 'idle'; this.level = 0; this.shown = 0; this.mouthAt = 0; this.metrics = { firstMouthMs: null, samples: [] }; }

  async init(container) {
    const { TalkingHead } = await import('../../vendor/talkinghead/talkinghead.mjs');
    this.host = Object.assign(document.createElement('div'), { className: 'th-host' });
    container.append(this.host);
    this.head = new TalkingHead(this.host, {
      ttsEndpoint: '', lipsyncModules: ['en'], cameraView: 'upper', cameraRotateEnable: false, cameraPanEnable: false, cameraZoomEnable: false,
      modelFPS: 30, modelPixelRatio: Math.min(globalThis.devicePixelRatio || 1, 1.5), avatarMood: 'neutral', avatarIdleEyeContact: 0.5, avatarIdleHeadMove: this.reduceMotion ? 0 : 0.5,
      // a warm three-point studio: soft key from the upper left, fill from the right, a little rim light, in the paper's warm white
      lightAmbientColor: 0xfff1dc, lightAmbientIntensity: 1.6, lightDirectColor: 0xffe2b8, lightDirectIntensity: 18, lightDirectPhi: 1.0, lightDirectTheta: 1.8,
      lightSpotColor: 0xfff6e8, lightSpotIntensity: 6, lightSpotPhi: 1.0, lightSpotTheta: -1.6, lightSpotDispersion: 1,
    });
    await this.head.showAvatar({ url: this.url, body: 'F', avatarMood: 'neutral', lipsyncLang: 'en' });
    this.head.setView('upper', { cameraX: 0, ...VIEW, ...(globalThis.APP_CONFIG?.mentorView ?? {}) });   // mentorView in config.js can nudge the framing
    for (const [key, value] of Object.entries(RESTING)) this.head.setFixedValue(key, value);
    this.onPointer = (event) => {
      if (this.reduceMotion || performance.now() - (this.lookAt ?? 0) < 120) return;
      this.lookAt = performance.now();
      if (this.state === 'thinking') return;
      const x = innerWidth / 2 + (event.clientX - innerWidth / 2) * 0.35, y = innerHeight / 2 + (event.clientY - innerHeight / 2) * 0.35;   // the eyes follow, but the head only leans a little
      this.head.lookAt(x, y, 900);
    };
    globalThis.addEventListener('pointermove', this.onPointer, { passive: true });
    this.loop = setInterval(() => this.tick(), 16);
    this.ready = true;
  }

  /** One mouth/nod update (about 30 times a second): the jaw follows the voice, a nod rides on the student's voice. */
  tick() {
    if (!this.ready) return;
    const speaking = this.state === 'speaking';
    const now = performance.now(), dt = Math.min(100, now - (this.lastTick ?? now - 16)); this.lastTick = now;
    const tau = this.level > this.shown ? 25 : 55;   // attack and release in real milliseconds, so a busy page cannot make the mouth lag or hang open
    this.shown += (this.level - this.shown) * (1 - Math.exp(-dt / tau));
    const open = speaking ? clamp(this.shown * 1.9) : 0;
    // mouth shapes from where the sound's energy is: round vowels pucker, open vowels drop the jaw, e/i/s/f stretch the lips and nearly close the jaw
    const { low = 0, mid = 0, high = 0 } = this.bands ?? {};
    const total = low + mid + high + 0.001;
    const round = clamp((low / total - 0.34) * 2.2), wide = clamp((high / total - 0.3) * 2.2);
    const on = open > 0.03;
    this.metrics.jaw = on ? open : 0; this.metrics.state = this.state;   // exposed for the timing test
    this.head.setFixedValue('jawOpen', on ? open * (0.85 - wide * 0.45) : null);
    this.head.setFixedValue('mouthFunnel', on ? open * round * 0.6 : null);
    this.head.setFixedValue('mouthPucker', on ? open * round * 0.35 : null);
    this.head.setFixedValue('mouthStretchLeft', on ? open * wide * 0.55 : null);
    this.head.setFixedValue('mouthStretchRight', on ? open * wide * 0.55 : null);
    this.head.setFixedValue('mouthClose', speaking && !on ? 0.25 : null);   // lips meet between words
    this.head.setFixedValue('mouthSmile', speaking ? RESTING.mouthSmile * (1 - open) : (this.state === 'happy' ? 0.7 : RESTING.mouthSmile));
    if (open > 0.05 && this.pending) { this.metrics.firstMouthMs = Math.round(performance.now() - this.pending); this.metrics.samples.push(this.metrics.firstMouthMs); this.pending = 0; }   // chunk arrived -> mouth moving
    if (!speaking && this.level < 0.02) this.pending = 0;
    if (this.state === 'listening' && this.level > 0.12 && !this.reduceMotion && performance.now() - this.mouthAt > 850) {
      this.mouthAt = performance.now();
      this.head.lookAt(innerWidth / 2, innerHeight * 0.54, 300);   // a small nod toward the student, then back
      setTimeout(() => this.ready && this.head.lookAtCamera(500), 330);
    }
  }

  setState(state) {
    this.state = state;
    if (!this.ready) return;
    const concerned = state === 'concerned';
    this.head.setFixedValue('browInnerUp', concerned ? 0.55 : state === 'thinking' ? 0.3 : RESTING.browInnerUp);
    this.head.setMood(state === 'happy' ? 'happy' : 'neutral');
    if (state === 'thinking' && !this.reduceMotion) this.head.lookAt(innerWidth * 0.6, innerHeight * 0.34, 2500);   // eyes up and to the side
    if (state === 'listening' || state === 'idle') this.head.lookAtCamera(600);
  }

  setLevel(level, bands) { this.level = clamp(level); if (bands) this.bands = bands; }
  speak(chunk) { if (chunk && !this.pending) this.pending = performance.now(); }   // the call plays the sound; this only notes when it arrived (for the latency figure)
  interrupt() { this.level = 0; this.shown = 0; this.head?.setFixedValue('jawOpen', null); }

  async destroy() {
    this.ready = false;
    clearInterval(this.loop);
    globalThis.removeEventListener('pointermove', this.onPointer);
    try { this.head?.stop(); } catch { /* not running */ }
    try { this.head?.renderer?.dispose(); this.head?.renderer?.forceContextLoss(); } catch { /* already gone */ }
    this.host?.remove();
    this.head = null;
  }
}
