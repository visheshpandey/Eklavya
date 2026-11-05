// The voice button and its status line. Tapping starts or ends a free conversation.
// While a call runs, a soft halo grows and shrinks with whoever is talking (setLevel, fed by the voice client).
import { el } from '../lib/dom.js';
import { mountOrb } from '../motion/index.js';
import { icon } from '../lib/icons.js';
import { VOICE_STATUS } from '../lib/protocol.js';
import { t } from '../lib/strings.js';
import { selectLanguage, selectLive, selectVoiceStatus } from '../state/selectors.js';
import { isConnecting, statusKey } from '../lib/voice-phase.js';

/** @returns {{setLevel: (level: number) => void}} */
export function mountSessionOrb({ store, orb, status, onToggle }) {
  orb.addEventListener('click', onToggle);
  const sphere = mountOrb(orb);   // a 3D sphere behind the button, driven by the same state and voice level

  function draw() {
    const textMode = selectLive(store.getState()).text;   // the voice would not connect: the orb offers it again instead of showing a live call
    const voiceStatus = textMode ? VOICE_STATUS.IDLE : selectVoiceStatus(store.getState());
    orb.dataset.state = voiceStatus;
    orb.setAttribute('aria-pressed', String(voiceStatus !== VOICE_STATUS.IDLE));   // pressed while a conversation is open
    sphere.setState(voiceStatus);
    if (voiceStatus === VOICE_STATUS.SPEAKING) orb.replaceChildren(el('span', { class: 'orb-bars', 'aria-hidden': 'true' }, ...[0, 1, 2, 3, 4].map(() => el('span'))));
    else orb.replaceChildren(icon(voiceStatus === VOICE_STATUS.IDLE || voiceStatus === VOICE_STATUS.CONNECTING ? 'microphone' : 'stop', { size: 36 }));
    document.getElementById('liveTag')?.toggleAttribute('hidden', voiceStatus === VOICE_STATUS.IDLE || !selectLive(store.getState()).ready);   // "Live" only once Eklavya is really there; never in text mode
    orb.setAttribute('aria-label', textMode ? 'Try the voice again' : voiceStatus === VOICE_STATUS.IDLE ? 'Start a voice conversation' : 'End the voice conversation');
    const live = selectLive(store.getState());
    const realStatus = selectVoiceStatus(store.getState());
    status.textContent = t(statusKey({ status: realStatus, live }), selectLanguage(store.getState()));
    status.classList.toggle('is-connecting', isConnecting({ status: realStatus, live }));   // a small spinner while Eklavya is not ready yet
    if (voiceStatus === VOICE_STATUS.IDLE) orb.style.setProperty('--level', '0');
  }
  store.select(selectVoiceStatus, draw);
  store.select(selectLive, draw);
  store.select(selectLanguage, draw);

  let shown = 0;
  return {
    /** 0-1 loudness; smoothed so the halo breathes instead of flickering. */
    setLevel(level) {
      shown = shown * 0.7 + Math.max(0, Math.min(1, level)) * 0.3;
      orb.style.setProperty('--level', shown.toFixed(3));
      sphere.setLevel(level);
    },
  };
}
