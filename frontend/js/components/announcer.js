// Screen-reader announcements. The conversation panel stays silent while text streams in word by word;
// this region speaks each finished tutor message once, new whiteboard cards, and connection changes.
import { VOICE_STATUS } from '../lib/protocol.js';
import { selectBoards, selectMessages, selectVoiceStatus } from '../state/selectors.js';

const STATUS_TEXT = {
  [VOICE_STATUS.CONNECTING]: 'Connecting to Eklavya.',
  [VOICE_STATUS.LISTENING]: 'Listening.',
  [VOICE_STATUS.IDLE]: 'Voice conversation ended.',
};

export function mountAnnouncer({ store, root }) {
  let lastSaid = null;
  let first = true;
  store.select(selectMessages, (messages) => {
    const last = [...messages].reverse().find((m) => m.role === 'tutor' && m.final);
    if (last && last.text !== lastSaid) { lastSaid = last.text; root.textContent = `Eklavya: ${last.text}`; }
  });
  let boardsAnnounced = 0;   // a board updated in place (next step) is not announced again
  store.select(selectBoards, (boards) => {
    if (boards.length > boardsAnnounced) root.textContent = `On the whiteboard: ${boards[boards.length - 1].title}.`;
    boardsAnnounced = boards.length;
  });
  store.select(selectVoiceStatus, (status) => {
    if (first) { first = false; return; }                          // nothing to announce at page load
    if (STATUS_TEXT[status]) root.textContent = STATUS_TEXT[status];
  });
}
