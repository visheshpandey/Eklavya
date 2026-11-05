// A number that counts from one value to another (38% -> 47.3%), so a mastery change is seen to happen, not just read.
// Pure timing with injectable clock and frame function; with "reduce motion" (or no animation frames) it lands on the final value at once.
import { round1 } from './format.js';

/** Ease-out: fast at first, slowing into the final value. t is 0..1. */
export const easeOut = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** The value `ms` into the animation (pure). */
export const valueAt = (from, to, elapsed, duration) => (duration <= 0 ? to : from + (to - from) * easeOut(elapsed / duration));

/**
 * @param {{from: number, to: number, ms?: number, onUpdate: (value: number) => void, reduce?: boolean,
 *   frame?: (fn: Function) => any, now?: () => number}} options
 * @returns {() => void} stops the animation
 */
export function countUp({ from, to, ms = 700, onUpdate, reduce = false, frame = globalThis.requestAnimationFrame?.bind(globalThis), now = () => globalThis.performance?.now?.() ?? Date.now() }) {
  if (reduce || !frame || from === to) { onUpdate(to); return () => {}; }
  const started = now();
  let stopped = false;
  onUpdate(from);
  const tick = () => {
    if (stopped) return;
    const elapsed = now() - started;
    onUpdate(elapsed >= ms ? to : valueAt(from, to, elapsed, ms));
    if (elapsed < ms) frame(tick);
  };
  frame(tick);
  return () => { stopped = true; };
}

/** "47.3%" from a number being animated. */
export const percentText = (value) => `${round1(value)}%`;
