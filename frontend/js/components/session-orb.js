// The big mic button and its status line. Clicking starts or ends a free-conversation session.
import { selectVoiceStatus } from '../state/selectors.js';
import { VOICE_STATUS } from '../lib/protocol.js';

const STATUS_TEXT = {
  [VOICE_STATUS.IDLE]: 'Tap to talk to Eklavya',
  [VOICE_STATUS.CONNECTING]: 'Connecting…',
  [VOICE_STATUS.LISTENING]: 'Listening… just talk',
  [VOICE_STATUS.SPEAKING]: 'Eklavya is speaking. Talk to interrupt.',
};

export function mountSessionOrb({ store, orb, status, onToggle }) {
  orb.addEventListener('click', onToggle);
  store.select(selectVoiceStatus, (voiceStatus) => {
    orb.dataset.state = voiceStatus;
    orb.setAttribute('aria-label', voiceStatus === VOICE_STATUS.IDLE ? 'Start voice session' : 'End voice session');
    status.textContent = STATUS_TEXT[voiceStatus];
  });
}
