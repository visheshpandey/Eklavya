// End-of-test summary: score, mastery change, the mistakes to fix.
import { el, render } from '../lib/dom.js';
import { round1, signed } from '../lib/format.js';
import { selectSummary } from '../state/selectors.js';

export function mountSummaryCard({ store, root }) {
  store.select(selectSummary, (summary) => {
    root.hidden = !summary;
    if (!summary) { root.replaceChildren(); return; }
    const delta = round1(summary.mastery_after - summary.mastery_before);
    render(root,
      el('div', { class: 'card-title' }, el('span', { text: 'Test complete' }), el('span', { class: 'pill', text: summary.topic })),
      el('p', { class: 'score', text: `${summary.correct} / ${summary.total} correct` }),
      el('p', { text: `Mastery ${summary.mastery_before}% → ${summary.mastery_after}% (${signed(delta)})` }),
      summary.misconceptions.length
        ? el('div', {}, el('p', { text: 'Mistakes to fix:' }), el('ul', {}, summary.misconceptions.map((m) => el('li', { text: m }))))
        : null,
      summary.resolved ? el('p', { class: 'resolved', text: `${summary.resolved} misconception(s) resolved` }) : null,
    );
  });
}
