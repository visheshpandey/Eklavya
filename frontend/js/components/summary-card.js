// End-of-test summary: score, mastery change, the mistakes to fix.
import { el, render as replaceContent } from '../lib/dom.js';
import { round1, signed } from '../lib/format.js';
import { selectSummary } from '../state/selectors.js';

export function mountSummaryCard({ store, root }) {
  store.select(selectSummary, (summary) => {
    root.hidden = !summary;
    if (!summary) { replaceContent(root); return; }
    const delta = round1(summary.mastery_after - summary.mastery_before);
    replaceContent(root,
      el('div', { class: 'quiz-head' }, el('h3', { class: 'quiz-count', text: 'Test complete' }), el('span', { class: 'quiz-topic', text: summary.topic })),
      el('p', { class: 'score', text: `${summary.correct} of ${summary.total} correct` }),
      el('p', { text: `Mastery ${summary.mastery_before}% to ${summary.mastery_after}% (${signed(delta)})` }),
      summary.misconceptions.length
        ? el('div', {}, el('p', { text: 'Mistakes to fix:' }), el('ul', {}, summary.misconceptions.map((m) => el('li', { text: m }))))
        : null,
      summary.resolved ? el('p', { class: 'resolved', text: `${summary.resolved} misconception(s) resolved` }) : null);
  });
}
