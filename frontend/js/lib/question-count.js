// The "Question N of T" counter of a test (pure): the question being answered is one past the answers so far, and never past the total.
// Counting questions *shown* instead breaks when one was skipped or carried over unanswered from a voice call ("Question 4 of 3").

/** The number of the next question, given how many are answered. */
export const questionNumber = (answered, total) => Math.max(1, Math.min(answered + 1, total));

/** A quiz_question event with its number kept within 1..total (an event without a total is left alone). */
export function clampQuestion(question) {
  if (!question || !Number.isInteger(question.total) || question.total < 1 || !Number.isFinite(question.number)) return question;
  const number = Math.max(1, Math.min(question.number, question.total));
  return number === question.number ? question : { ...question, number };
}
