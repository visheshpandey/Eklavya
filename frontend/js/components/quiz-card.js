// The question on screen (read aloud by the tutor) with tappable options, and its grade once answered.
// The card shows its own snapshot ({question, result}) so a result can stay readable for a moment after the next
// question has arrived (see lib/feedback-hold.js).
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { changeParts, masteryChange } from '../lib/mastery-change.js';
import { createFeedbackHold } from '../lib/feedback-hold.js';
import { feedbackLimitMs, feedbackMs } from '../lib/feedback-timing.js';
import { createAnswerGuard } from '../lib/answer-guard.js';
import { selectMessages, selectQuestion, selectResult } from '../state/selectors.js';

export function mountQuizCard({ store, root, onAnswer, onNext = null, hold = createFeedbackHold(), guard = createAnswerGuard() }) {
  let shown = { question: null, result: null };   // what the card displays right now
  let picked = null;                              // the option the student tapped (replaced by the graded choice)
  let lastTutorText = null;
  let armedFor;                                   // the question the answer guard was last armed for

  function resultBlock(result) {
    // the change was worked out once, when the answer was graded (lib/mastery-change.js); the card only shows it, and always the final number
    const change = result.delta !== undefined ? result : masteryChange(result.before, result.after);
    const parts = changeParts(change);
    return el('div', { class: `result ${result.is_correct ? 'ok' : 'bad'}`, role: 'status' },
      el('div', { class: 'hold-line', style: `--hold-ms: ${feedbackMs(result.is_correct)}ms`, 'aria-hidden': 'true' }),
      el('div', { class: 'result-main' },
        el('div', { class: 'result-title' }, icon(result.is_correct ? 'check-circle' : 'warning', { size: 30 }), result.is_correct ? 'Correct' : 'Not quite'),
        el('p', { class: 'result-mastery' }, `${result.topic} mastery `, el('span', { class: 'was', text: parts.was }), ' → ', el('b', { class: 'mastery-num', text: parts.now }),
          el('span', { class: `delta ${change.delta >= 0 ? 'up' : 'down'}`, text: ` (${parts.delta})` }))),
      result.misconception ? el('p', { text: `Misconception: ${result.misconception.text}` }) : null,
      result.misconceptions_resolved ? el('p', { class: 'resolved', text: 'Misconception resolved' }) : null,
      // the test moves on by itself after a few seconds; this is the same step, now
      onNext && shown.question?.total && shown.question.number < shown.question.total
        ? el('button', { class: 'btn btn-primary btn-sm next-q', type: 'button', onclick: (event) => { event.preventDefault(); event.stopPropagation(); if (event.currentTarget.disabled) return; event.currentTarget.disabled = true; hold.release(); onNext(); } }, 'Continue') : null);
  }

  /** The state of one option once the question has been graded: the right one, and the wrong one that was chosen. */
  function optionState(letter, result) {
    if (!result) return picked === letter ? ' picked' : '';
    if (result.correct_answer === letter) return ' is-right';
    if (result.chosen === letter && !result.is_correct) return ' is-wrong';
    return '';
  }

  function draw() {
    const { question, result } = shown;
    root.hidden = !question;
    if (!question) { replaceContent(root); return; }
    if (question !== armedFor) { armedFor = question; guard.arm(question); }   // a new question: ignore clicks for a moment (the page scrolls to the first one only: see study-focus)
    replaceContent(root,
      el('div', { class: 'quiz-head' },
        el('h3', { class: 'quiz-count', text: question.number ? `Question ${question.number} of ${question.total}` : 'Quiz question' }),
        el('span', { class: 'quiz-topic', text: question.topic })),
      el('p', { class: 'q-text', text: question.question }),
      el('div', { class: 'opts', role: 'group', 'aria-label': 'Answer options' }, (question.options ?? []).map((option) => {
        const letter = option.trim().charAt(0);
        const forQuestion = question;   // the question this button belongs to
        return el('button', {
          class: `opt${optionState(letter, result)}`, type: 'button', disabled: Boolean(result),
          onclick: (event) => {
            if (!guard.allows(forQuestion) || shown.question !== forQuestion) { event.preventDefault(); return; }   // too soon after the question appeared, or a stale button
            picked = letter; onAnswer(letter); draw();
          },
        }, option);
      })),
      el('p', { class: 'hint', text: 'Say your answer out loud, or choose an option.' }),
      result ? resultBlock(result) : null);
  }

  store.select(selectQuestion, (question) => {
    if (question === shown.question) return;
    if (!question) { hold.release(); shown = { question: null, result: null }; picked = null; draw(); return; }   // session reset
    // a new question: swap it in when the previous result has been on screen long enough
    hold.swap(() => { shown = { question, result: selectResult(store.getState()) }; picked = null; draw(); });
  });

  store.select(selectResult, (result) => {
    // the state clears the result the moment the next question arrives; the card keeps showing it until the swap
    if (!shown.question || !result) return;
    if (result && result.question_id != null && shown.question.question_id !== result.question_id) return;   // belongs to a newer question: shown after the swap
    shown = { ...shown, result };
    if (result) { picked = result.chosen ?? picked; hold.resultShown({ holdMs: feedbackMs(result.is_correct), maxHoldMs: feedbackLimitMs(result.is_correct) }); }
    draw();
  });

  // the tutor started a new message: if it is reading out the next question, that ends the hold
  store.select(selectMessages, (messages) => {
    const lastTutor = [...messages].reverse().find((m) => m.role === 'tutor');
    const text = lastTutor ? lastTutor.text : null;
    if (text !== lastTutorText) { lastTutorText = text; hold.tutorSpoke(); }
  });
}
