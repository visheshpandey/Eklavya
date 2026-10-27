// Keeps a quiz result ("Correct, mastery 38% to 47%") on screen long enough to read before the next question replaces it.
// The next question may arrive the instant an answer is graded; swapping at once made "Correct" blink past while
// "Not quite" (which is followed by a spoken follow-up) always stayed. Both are held the same way:
//   the swap happens at the LATER of (a) `holdMs` after the result appeared and (b) the tutor starting to speak the
//   next question, but never later than `maxHoldMs` after the result appeared (typed sessions, a silent tutor).
// Pure logic with injectable clock and timers so it can be unit tested.

export function createFeedbackHold({ holdMs = 2500, maxHoldMs = 6000, now = () => Date.now(),
  schedule = (fn, ms) => setTimeout(fn, ms), cancel = (id) => clearTimeout(id) } = {}) {
  let shownAt = null;      // when the result on screen appeared; null = nothing is being held
  let pending = null;      // the swap waiting for its turn
  let spoke = false;       // the tutor has started speaking since the swap was requested
  let timers = [];

  const clearTimers = () => { timers.forEach(cancel); timers = []; };

  function flush() {
    if (!pending) return;
    const apply = pending;
    pending = null;
    shownAt = null;
    spoke = false;
    clearTimers();
    apply();
  }

  function ready() {
    const elapsed = now() - shownAt;
    return elapsed >= maxHoldMs || (elapsed >= holdMs && spoke);
  }

  return {
    /** A result just appeared on screen: start the clock. */
    resultShown() { shownAt = now(); },

    /** Show something else (the next question). Runs `apply` now if nothing is held, otherwise when it is time. */
    swap(apply) {
      if (shownAt === null) { apply(); return; }
      pending = apply;
      spoke = false;
      clearTimers();
      const elapsed = now() - shownAt;
      timers.push(schedule(() => { if (pending && ready()) flush(); }, Math.max(0, holdMs - elapsed)));
      timers.push(schedule(flush, Math.max(0, maxHoldMs - elapsed)));
    },

    /** The tutor started speaking (a transcript or audio arrived): the next question is being read out. */
    tutorSpoke() {
      if (!pending) return;
      spoke = true;
      if (ready()) flush();
    },

    /** Nothing is held any more (a new session, notes changed): show whatever is current at once. */
    release() {
      if (pending) flush(); else { shownAt = null; clearTimers(); }
    },

    get holding() { return shownAt !== null; },
  };
}
