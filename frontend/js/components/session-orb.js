// The voice button and its status line. Tapping starts or ends a free conversation.
// While a call runs, a soft halo grows and shrinks with whoever is talking (setLevel, fed by the voice client).
import { el } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { VOICE_STATUS } from '../lib/protocol.js';
import { t } from '../lib/strings.js';
import { selectLanguage, selectVoiceStatus } from '../state/selectors.js';

const STATUS_KEY = {
  [VOICE_STATUS.IDLE]: 'stage.idle',
  [VOICE_STATUS.CONNECTING]: 'stage.connecting',
  [VOICE_STATUS.LISTENING]: 'stage.listening',
  [VOICE_STATUS.SPEAKING]: 'stage.speaking',
};

/** @returns {{setLevel: (level: number) => void}} */
export function mountSessionOrb({ store, orb, status, onToggle }) {
  orb.addEventListener('click', onToggle);

  function draw() {
    const voiceStatus = selectVoiceStatus(store.getState());
    orb.dataset.state = voiceStatus;
    if (voiceStatus === VOICE_STATUS.SPEAKING) orb.replaceChildren(el('span', { class: 'orb-bars', 'aria-hidden': 'true' }, ...[0, 1, 2, 3, 4].map(() => el('span'))));
    else orb.replaceChildren(icon(voiceStatus === VOICE_STATUS.IDLE || voiceStatus === VOICE_STATUS.CONNECTING ? 'microphone' : 'stop', { size: 36 }));
    document.getElementById('liveTag')?.toggleAttribute('hidden', voiceStatus === VOICE_STATUS.IDLE);
    orb.setAttribute('aria-label', voiceStatus === VOICE_STATUS.IDLE ? 'Start a voice conversation' : 'End the voice conversation');
    status.textContent = t(STATUS_KEY[voiceStatus], selectLanguage(store.getState()));
    if (voiceStatus === VOICE_STATUS.IDLE) orb.style.setProperty('--level', '0');
  }
  store.select(selectVoiceStatus, draw);
  store.select(selectLanguage, draw);

  let shown = 0;
  return {
    /** 0-1 loudness; smoothed so the halo breathes instead of flickering. */
    setLevel(level) {
      shown = shown * 0.7 + Math.max(0, Math.min(1, level)) * 0.3;
      orb.style.setProperty('--level', shown.toFixed(3));
    },
  };
}
