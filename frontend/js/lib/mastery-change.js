// The mastery change of one answer, worked out ONCE. The toast, the Correct / Not quite card, the summary and the Progress page all read this
// object and this formatter, so the same number can never show two ways. Rounding to one decimal happens here and nowhere else; the delta is the
// difference of the two rounded numbers, so before + delta always equals after exactly as displayed.
import { round1, signed } from './format.js';

/** {before, after, delta} for one answer, each rounded to 1 decimal. */
export function masteryChange(before, after) {
  const b = round1(Number(before)), a = round1(Number(after));
  return { before: b, after: a, delta: round1(a - b) };
}

export const pct = (n) => `${round1(n)}%`;

/** The three pieces of "38% → 47.3% (+9.3)". */
export const changeParts = ({ before, after, delta }) => ({ was: pct(before), now: pct(after), delta: signed(delta) });

/** "38% → 47.3% (+9.3)" */
export const changeText = (change) => { const p = changeParts(change); return `${p.was} → ${p.now} (${p.delta})`; };

/** The toast: "Precision: 38% → 47.3%" */
export const toastText = (topic, { before, after }) => `${topic}: ${pct(before)} → ${pct(after)}`;

/** The line on the card: "Precision mastery 38% → 47.3% (+9.3)" */
export const cardText = (topic, change) => `${topic} mastery ${changeText(change)}`;
