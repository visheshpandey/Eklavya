// "Weakest topic: X": worked out from the same rows the Progress table shows (topics the student has started), never written by hand.
import { round1 } from './format.js';

/** The started topic with the lowest mastery, or null when nothing has been started. Ties go to the first row. */
export function lowestMastery(rows = []) {
  let best = null;
  for (const row of rows) {
    if (row.started === false) continue;
    if (best === null || row.mastery_score < best.mastery_score) best = row;
  }
  return best;
}

export function weakestLine(rows) {
  const row = lowestMastery(rows);
  return row ? `Weakest topic: ${row.topic_name} (${round1(row.mastery_score)}%)` : '';
}

/** "You" for the student's own row (the name is already "You": no "You (you)"). */
export const youName = (name) => (String(name).trim().toLowerCase() === 'you' ? 'You' : `${name} (you)`);
