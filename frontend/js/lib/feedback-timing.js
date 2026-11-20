// How long a graded answer stays on screen before the test moves on. A wrong answer carries the misconception, the best moment of the
// demo, so it stays long enough to read with the sound off; a right one only needs a beat.
export const WRONG_MS = 5000;
export const RIGHT_MS = 1500;
export const feedbackMs = (isCorrect) => (isCorrect ? RIGHT_MS : WRONG_MS);
// the latest the card may stay: a right answer moves on at 1.5 s even if Eklavya is still talking; a wrong one waits a little for Eklavya to finish
export const feedbackLimitMs = (isCorrect) => (isCorrect ? RIGHT_MS : WRONG_MS + 3000);
