// The reply bubble must never stay empty. After the student has spoken or typed, Eklavya's words (a transcript, or something
// visible such as a question or a board) have to arrive: within `afterTurnMs` of the turn ending, or within `silentMs` of the
// student finishing if the turn never ends. If not, `onTimeout(what the student said)` fills the bubble another way. Pure timing
// logic with injectable timers, so it can be tested without waiting.
import { cancel as defaultCancel, schedule as defaultSchedule } from './timers.js';

export function createReplyWatchdog({ onTimeout, silentMs = 20000, afterTurnMs = 8000, schedule = defaultSchedule, cancel = defaultCancel }) {
  let waiting = false;
  let said = '';
  let timer = null;

  const clear = () => { if (timer != null) { cancel(timer); timer = null; } };
  const arm = (ms) => {
    clear();
    timer = schedule(() => {
      timer = null;
      if (!waiting) return;
      waiting = false;
      onTimeout(said);
    }, ms);
  };

  return {
    /** The student finished speaking or typed something: a reply is now owed. */
    userSpoke(text) { waiting = true; said = text; arm(silentMs); },
    /** Gemini says the turn is over: if no words came with it, the short clock starts. */
    turnComplete() { if (waiting) arm(afterTurnMs); },
    /** Words (or a question, a board, a grade) arrived: the reply is here. */
    replied() { waiting = false; clear(); },
    /** The call ended or changed: forget everything. */
    reset() { waiting = false; clear(); },
    get waiting() { return waiting; },
  };
}
