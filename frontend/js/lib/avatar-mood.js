// How Eklavya's face looks right now (pure). The tutor already reports how the student sounds and whether the last
// answer was right; the face just reflects that.
//   happy  the last answer was right
//   gentle the last answer was wrong, or the student sounds confused or frustrated
//   calm   everything else
// "thinking" is shown while the call is connecting. Returns { mood, state }: state is the voice status for the mouth.
import { VOICE_STATUS } from './protocol.js';

const HIGH = 0.6;

export function avatarLook({ status = VOICE_STATUS.IDLE, emotion = null, result = null } = {}) {
  if (status === VOICE_STATUS.CONNECTING) return { mood: 'thinking', state: status };
  if (result && result.is_correct === true) return { mood: 'happy', state: status };
  if (result && result.is_correct === false) return { mood: 'gentle', state: status };
  if (emotion && (emotion.frustration >= HIGH || emotion.confusion >= HIGH)) return { mood: 'gentle', state: status };
  return { mood: 'calm', state: status };
}
