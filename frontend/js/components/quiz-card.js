// The question on screen (read aloud by the tutor) with tappable options, and its grade once answered.
import { el, render } from '../lib/dom.js';
import { round1, signed } from '../lib/format.js';
import { selectQuestion, selectResult } from '../state/selectors.js';

export function mountQuizCard({ store, root, onAnswer }) {
  let picked = null;

  function draw() {
    const { question, result } = { question: selectQuestion(store.getState()), result: selectResult(store.getState()) };
    root.hidden = !question;
    if (!question) { root.replaceChildren(); return; }
    const title = question.number ? `Question ${question.number} of ${question.total} · ${question.topic}` : question.topic;
    render(root,
      el('div', { class: 'card-title' }, el('span', { text: 'Quiz' }), el('span', { class: 'pill', text: title })),
      el('p', { class: 'q-text', text: question.question }),
      el('div', { class: 'opts' }, (question.options ?? []).map((option) => {
        const letter = option.trim().charAt(0);
        return el('button', {
          class: `opt${picked === letter ? ' picked' : ''}`, type: 'button', disabled: Boolean(result),
          onclick: () => { picked = letter; onAnswer(letter); draw(); },
        }, option);
      })),
      el('p', { class: 'hint', text: 'Say your answer out loud, or tap an option.' }),
      result ? resultBlock(result) : null,
    );
  }

  function resultBlock(result) {
    const delta = round1(result.after - result.before);
    return el('div', { class: `result ${result.is_correct ? 'ok' : 'bad'}` },
      el('strong', { text: result.is_correct ? 'Correct' : 'Not quite' }),
      el('span', { text: ` ${result.topic} mastery ${result.before}% → ${result.after}% (${signed(delta)})` }),
      result.misconception ? el('p', { class: 'mis', text: `Misconception: ${result.misconception.text}` }) : null,
      result.misconceptions_resolved ? el('p', { class: 'resolved', text: 'Misconception resolved' }) : null);
  }

  store.select(selectQuestion, () => { picked = null; draw(); });
  store.select(selectResult, draw);
}
