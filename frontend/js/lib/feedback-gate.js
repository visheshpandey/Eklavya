// When the "Three quick questions" card may open (pure, so it is tested without a page): only after enough answers or card ratings,
// and only once a session is over (the test summary is up, or the call has ended), never over a question that is still on screen.
import { selectSessionActive } from '../state/selectors.js';

export const FEEDBACK_NEEDED = 4;   // answers or card ratings before the card may appear

/** True when nothing is being asked: no session running, or the session's test is finished and its summary is showing. */
export const sessionIsOver = (state) => !selectSessionActive(state) || Boolean(state.session?.summary);

/**
 * @param {{done: () => boolean, canShow: () => boolean, open: () => void, needed?: number}} deps
 * `done`: answered or dismissed already (or the card is open). `count()` adds one answer; `sessionEnded()` is the only moment the card opens.
 */
export function createFeedbackGate({ done, canShow, open, needed = FEEDBACK_NEEDED }) {
  let seen = 0;
  return {
    count() { if (!done()) seen += 1; },
    sessionEnded() {
      if (done() || seen < needed || !canShow()) return false;
      open();
      return true;
    },
  };
}
