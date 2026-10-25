// The question on screen (read aloud by the tutor) with tappable options, and its grade once answered.
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { round1, signed } from '../lib/format.js';
import { selectQuestion, selectResult } from '../state/selectors.js';

export function mountQuizCard({ store, root, onAnswer }) {
  let picked = null;

  function resultBlock(result) {
    const delta = round1(result.after - result.before);
    return el('div', { class: `result ${result.is_correct ? 'ok' : 'bad'}`, role: 'status' },
      el('div', { class: 'result-title' }, icon(result.is_correct ? 'check-circle' : 'warning', { size: 20 }), result.is_correct ? 'Correct' : 'Not quite'),
      el('p', { text: `${result.topic} mastery ${result.before}% to ${result.after}% (${signed(delta)})` }),
      result.misconception ? el('p', { text: `Misconception: ${result.misconception.text}` }) : null,
      result.misconceptions_resolved ? el('p', { class: 'resolved', text: 'Misconception resolved' }) : null);
  }

  function draw() {
    const question = selectQuestion(store.getState());
    const result = selectResult(store.getState());
    root.hidden = !question;
    if (!question) { replaceContent(root); return; }
    replaceContent(root,
      el('div', { class: 'quiz-head' },
        el('h3', { class: 'quiz-count', text: question.number ? `Question ${question.number} of ${question.total}` : 'Quiz question' }),
        el('span', { class: 'quiz-topic', text: question.topic })),
      el('p', { class: 'q-text', text: question.question }),
      el('div', { class: 'opts', role: 'group', 'aria-label': 'Answer options' }, (question.options ?? []).map((option) => {
        const letter = option.trim().charAt(0);
        return el('button', {
          class: `opt${picked === letter ? ' picked' : ''}`, type: 'button', disabled: Boolean(result),
          onclick: () => { picked = letter; onAnswer(letter); draw(); },
        }, option);
      })),
      el('p', { class: 'hint', text: 'Say your answer out loud, or choose an option.' }),
      result ? resultBlock(result) : null);
  }

  store.select(selectQuestion, () => { picked = null; draw(); });
  store.select(selectResult, draw);
}
