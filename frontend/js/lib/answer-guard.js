// A click that lands on an answer option the instant a new question appears is the "Next question" click, not an answer
// (option D sits where the button was). Pure, with an injectable clock, so it can be unit tested.
export const READY_MS = 700;

export function createAnswerGuard({ now = () => Date.now(), readyMs = READY_MS } = {}) {
  let id = null;
  let readyAt = 0;
  return {
    /** A question was put on screen. */
    arm(questionId) { id = questionId; readyAt = now() + readyMs; },
    /** May a click on an option of `questionId` count as an answer? Not before it is ready, and only for the question on screen. */
    allows(questionId) { return id !== null && questionId === id && now() >= readyAt; },
  };
}
