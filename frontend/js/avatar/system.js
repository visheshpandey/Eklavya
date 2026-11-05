// The mentor frame and the avatar providers behind it. Three providers share one interface:
//   init(container) · speak(audioChunk, text) · setState(state) · interrupt() · destroy()
// with state one of idle | listening | thinking | speaking | happy | concerned. They are tried in this order, falling back silently (and logging why):
//   1. photoreal  Simli video avatar, only while a call runs and only when config.js has a face id and the session endpoint answers within 5 s
//   2. 3d         TalkingHead.js with a realistic GLB; built while the Study room is on screen, freed when it is left
//   3. static     the drawn / built-in 3D bust (always there underneath, it is what shows until something better is ready)
import { avatarLook } from '../lib/avatar-mood.js';
import { afterLoad, guardPerformance, isLite, whenEngaged } from '../motion/env.js';
import { VOICE_STATUS } from '../lib/protocol.js';
import { selectEmotion, selectLive, selectResult, selectView, selectVoiceStatus } from '../state/selectors.js';
import { SimliProvider } from './simli-provider.js';

const SAMPLE_MODEL = 'assets/avatar/mentor-sample.glb';
const LABELS = { speaking: '● Live', listening: 'Listening…', thinking: 'Connecting…', concerned: 'Listening…' };   // 'thinking' is the connecting look: never "Listening…" before Eklavya is ready

/** The avatar state to show (pure): the voice status and the last answer decide it. */
export function deriveState({ status, emotion = null, result = null, level = 0 }) {
  const { mood } = avatarLook({ status, emotion, result });
  if (status === VOICE_STATUS.CONNECTING) return 'thinking';
  if (status === VOICE_STATUS.SPEAKING) return mood === 'happy' ? 'happy' : 'speaking';
  if (status === VOICE_STATUS.LISTENING) return mood === 'gentle' && level < 0.1 ? 'concerned' : 'listening';
  return 'idle';
}

export function mountMentorFrame({ store, frame, base, config = {}, setPlaybackMuted = () => {}, reduceMotion = false, hasWebGL = true, log = console }) {
  const layer3d = Object.assign(document.createElement('div'), { className: 'mf-layer mf-3d' });
  const layerPhoto = Object.assign(document.createElement('div'), { className: 'mf-layer mf-photo' });
  const shimmer = Object.assign(document.createElement('div'), { className: 'mf-shimmer', hidden: true });
  const pill = Object.assign(document.createElement('span'), { className: 'mf-pill', hidden: true, role: 'status' });
  frame.prepend(layer3d, layerPhoto);
  frame.append(shimmer, pill);
  frame.dataset.mode = 'static';

  // 'auto' | 'photoreal' | '3d' | 'static'; the address can override it for one visit (?avatar=3d forces the 3D mentor and clears the slow-device flag)
  const asked = new URLSearchParams(globalThis.location?.search ?? '').get('avatar');
  if (asked === '3d') { try { localStorage.removeItem('eklavya.lite'); } catch { /* fine */ } }
  const wanted = ['auto', 'photoreal', '3d', 'static'].includes(asked) ? asked : (config.avatarMode ?? 'auto');
  let three = null, photo = null, threeBuilding = false, photoBuilding = false, simliBlockedUntil = 0, level = 0, derived = 'idle';
  const metrics = { mode: 'static', lipLatencyMs: null, modeLog: [], simli: 'off' };
  const publish = () => { frame.dataset.mode = metrics.mode; globalThis.eklavyaAvatar = metrics; };
  const note = (text) => { metrics.modeLog.push(text); log.info?.(`[avatar] ${text}`); };

  const providers = () => [photo, three, base].filter(Boolean);
  const apply = () => { const state = derived; for (const provider of providers()) provider.setState?.(state); pill.hidden = !LABELS[state]; pill.textContent = LABELS[state] ?? ''; pill.dataset.state = state; };

  // ---- the 3D provider: while the Study room is on screen
  async function build3d() { /* the 3D face was removed: the drawn mentor is the avatar */ }
  async function free3d() {
    if (!three) return;
    const old = three; three = null;
    if (metrics.mode === '3d') { metrics.mode = 'static'; publish(); }
    await old.destroy();
  }

  // ---- the Simli provider: while a call runs
  async function startPhoto() {
    if (photo || photoBuilding || !config.simliFaceId || wanted === '3d' || wanted === 'static' || Date.now() < simliBlockedUntil) return;
    photoBuilding = true;
    frame.classList.add('is-connecting'); shimmer.hidden = false;
    const provider = new SimliProvider({ faceId: config.simliFaceId, tokenUrl: config.simliSessionUrl || '/api/simli-session', onLost: (why) => { note(`photoreal avatar closed (${why})`); stopPhoto(why !== 'idle'); } });
    try {
      await provider.init(layerPhoto);
      if (selectVoiceStatus(store.getState()) === VOICE_STATUS.IDLE) { await provider.destroy(); throw new Error('the call ended first'); }
      photo = provider; metrics.mode = 'photoreal'; metrics.simli = 'live';
      setPlaybackMuted(true);   // Simli plays the voice in sync with the face; ours would be an echo
      note('photoreal avatar live');
      apply(); publish();
    } catch (error) {
      note(`photoreal unavailable, using the 3d avatar: ${error.message ?? error}`);
      metrics.simli = 'failed';
      simliBlockedUntil = Date.now() + 60000;   // do not retry on every utterance
      await provider.destroy().catch(() => {});
    }
    photoBuilding = false; frame.classList.remove('is-connecting'); shimmer.hidden = true;
  }
  async function stopPhoto(fallBack = false) {
    if (!photo) return;
    const old = photo; photo = null;
    setPlaybackMuted(false);
    metrics.mode = three ? '3d' : 'static'; metrics.simli = fallBack ? 'dropped' : 'off';
    if (fallBack) simliBlockedUntil = Date.now() + 60000;
    publish();
    await old.destroy();
  }

  // ---- follow the app
  const refresh = () => {
    const state = store.getState();
    const live = selectLive(state);
    let status = selectVoiceStatus(state);
    if (live.text) status = VOICE_STATUS.IDLE;                                              // text mode: no call is running
    else if (status === VOICE_STATUS.LISTENING && !live.ready) status = VOICE_STATUS.CONNECTING;   // the socket is open but Eklavya is not up yet
    derived = deriveState({ status, emotion: selectEmotion(state), result: selectResult(state), level });
    apply();
  };
  store.select(selectVoiceStatus, (status) => {
    refresh();
    if (status === VOICE_STATUS.IDLE) stopPhoto(false);
    else if (status === VOICE_STATUS.CONNECTING) startPhoto();
  });
  store.select(selectLive, refresh);
  store.select(selectEmotion, refresh);
  store.select(selectResult, refresh);
  store.select(selectView, (view) => {
    if (view === 'study') build3d(); else { free3d(); stopPhoto(false); }
  });
  document.addEventListener('eklavya:lite', () => { if (wanted !== '3d') free3d(); });
  if (selectView(store.getState()) === 'study') build3d();
  publish();

  return {
    get mode() { return metrics.mode; },
    metrics,
    setLevel(next, bands) {
      level = next; metrics.level = next; if (three) { metrics.jaw = three.metrics.jaw; metrics.pstate = three.metrics.state; }
      base.setLevel?.(next);
      three?.setLevel(next, bands);
    },
    setTutor: (tutor) => base.setTutor?.(tutor),
    /** A chunk of Eklavya's voice arrived (PCM16 mono, 24 kHz). */
    feedAudio(chunk) { for (const provider of [photo, three]) provider?.speak(chunk); metrics.lipLatencyMs = three?.metrics.firstMouthMs ?? null; metrics.chunks = (metrics.chunks ?? 0) + 1; metrics.lipSamples = three?.metrics.samples.slice(-20) ?? []; },
    /** The student started talking over Eklavya: stop at once. */
    interrupt() { metrics.interrupts = (metrics.interrupts ?? 0) + 1; for (const provider of [photo, three, base]) provider?.interrupt?.(); },
    destroy() { free3d(); stopPhoto(false); },
  };
}
