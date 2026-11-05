// When the Study room is "at work" (a question, a result, a whiteboard, a summary is on screen) the mentor card shrinks and the header folds away,
// so the avatar, the question and the conversation fit on one laptop screen at once, and whatever just appeared is scrolled into view. Pure.

/** Is there something to look at besides the mentor? Only while a call (or text session) is running. */
export function isWorking({ active, question, boards = [], summary, viva, debateScores = [], verdict } = {}) {
  if (!active) return false;
  return Boolean(question || boards.length || summary || viva?.question || viva?.report || debateScores.length || verdict);
}

/** Which element to bring into view for what just changed (the most specific first), or null. */
export function focusTargetFor(prev, next) {
  const changed = (key) => next[key] && next[key] !== prev[key];
  if (changed('summary')) return '#summary';
  if (changed('result')) return '#quizcard .result';
  if (changed('question')) return '#quizcard';
  if (next.boardIndex >= 0 && next.boardIndex !== prev.boardIndex) return '#board';   // index 0 is the first board, so this is not a truthiness check
  if (changed('viva')) return '#viva';
  if (changed('verdict') || changed('debateScore')) return '#debateScore';
  return null;
}
