// The voice button and its status line. Tapping starts or ends a free conversation.
import { icon } from '../lib/icons.js';
import { VOICE_STATUS } from '../lib/protocol.js';
import { selectVoiceStatus } from '../state/selectors.js';

const STATUS_TEXT = {
  [VOICE_STATUS.IDLE]: 'Tap to talk to Eklavya',
  [VOICE_STATUS.CONNECTING]: 'Connecting...',
  [VOICE_STATUS.LISTENING]: 'Listening. Just talk.',
  [VOICE_STATUS.SPEAKING]: 'Eklavya is speaking. Talk to interrupt.',
};

export function mountSessionOrb({ store, orb, status, onToggle }) {
  orb.addEventListener('click', onToggle);
  store.select(selectVoiceStatus, (voiceStatus) => {
    orb.dataset.state = voiceStatus;
    orb.replaceChildren(icon(voiceStatus === VOICE_STATUS.IDLE || voiceStatus === VOICE_STATUS.CONNECTING ? 'microphone' : 'stop', { size: 30 }));
    orb.setAttribute('aria-label', voiceStatus === VOICE_STATUS.IDLE ? 'Start a voice conversation' : 'End the voice conversation');
    status.textContent = STATUS_TEXT[voiceStatus];
  });
}
