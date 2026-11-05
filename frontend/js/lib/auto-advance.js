// After a graded answer the test moves on by itself: `delayMs` after the result appeared (3 s), but never over the top of Eklavya
// still talking (`canAdvance`), and at the latest `maxMs` after it appeared. `disarm()` when the next question arrives by itself.
// Pure timing logic with injectable clock and timers.
import { cancel as defaultCancel, schedule as defaultSchedule } from './timers.js';

export function createAutoAdvance({ advance, canAdvance = () => true, delayMs = 3000, retryMs = 1500, maxMs = 20000,
  now = () => Date.now(), schedule = defaultSchedule, cancel = defaultCancel }) {
  let timer = null;
  let startedAt = 0;

  const clear = () => { if (timer != null) { cancel(timer); timer = null; } };
  function check() {
    timer = null;
    if (now() - startedAt >= maxMs || canAdvance()) { advance(); return; }
    timer = schedule(check, retryMs);   // Eklavya is still speaking: look again shortly
  }

  return {
    /** A result is on screen: the clock starts. */
    arm() { clear(); startedAt = now(); timer = schedule(check, delayMs); },
    /** The next question came by itself, or the session ended: nothing to do. */
    disarm() { clear(); },
    get armed() { return timer != null; },
  };
}
