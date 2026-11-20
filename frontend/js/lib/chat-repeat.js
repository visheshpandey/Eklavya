// The tutor sometimes says the question a second time right after the student's tap ("A"). The second copy adds nothing, so it is not shown.
// Only long lines count (6+ words): a short "Correct." may well be said twice.
const norm = (text) => String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const MIN_WORDS = 6;

/** Is messages[i] a tutor bubble that only repeats the previous tutor bubble (with at most one student message between)? */
export function isRepeat(messages, i) {
  const m = messages[i];
  if (!m || m.role !== 'tutor' || m.image) return false;
  const mine = norm(m.text);
  if (mine.split(' ').length < MIN_WORDS) return false;
  let j = i - 1;
  if (messages[j]?.role === 'user') j--;                  // one answer ("A") in between
  const before = messages[j];
  if (!before || before.role !== 'tutor') return false;
  const earlier = norm(before.text);
  return earlier === mine || earlier.startsWith(mine);    // equal, or the new bubble is still streaming the same words
}
