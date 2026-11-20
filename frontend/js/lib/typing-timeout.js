// The three typing dots must never run for ever: after 15 s with no reply they give way to a sentence saying what is happening.
// Pure timing with injectable timers.
export const TYPING_MAX_MS = 15000;
export const SLOW_TEXT = 'Eklavya is taking a while. Answering from your notes instead.';

export function createTypingTimer({ onSlow, ms = TYPING_MAX_MS, schedule = (fn, wait) => setTimeout(fn, wait), cancel = (id) => clearTimeout(id) }) {
  let timer = null;
  let slow = false;
  return {
    /** The dots are on screen: start counting (once, however often this is called). */
    start() { if (timer == null && !slow) timer = schedule(() => { timer = null; slow = true; onSlow(); }, ms); },
    /** A reply came or the dots went away: reset. */
    stop() { if (timer != null) cancel(timer); timer = null; slow = false; },
    get slow() { return slow; },
  };
}
