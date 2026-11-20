// End-of-test summary: score, mastery change, the mistakes to fix.
import { el, render as replaceContent } from '../lib/dom.js';
import { changeText, masteryChange } from '../lib/mastery-change.js';
import { selectLanguage, selectSummary } from '../state/selectors.js';
import { t } from '../lib/strings.js';

export function mountSummaryCard({ store, root }) {
  store.select(selectSummary, (summary) => {
    root.hidden = !summary;
    if (!summary) { replaceContent(root); return; }
    const change = masteryChange(summary.mastery_before, summary.mastery_after);
    const language = selectLanguage(store.getState());
    replaceContent(root,
      el('div', { class: 'quiz-head' }, el('h3', { class: 'quiz-count', text: t('sum.complete', language) }), el('span', { class: 'quiz-topic', text: summary.topic })),
      el('p', { class: 'score', text: t('sum.score', language, { correct: summary.correct, total: summary.total }) }),
      el('p', { text: t('sum.mastery', language, { change: changeText(change) }) }),
      summary.misconceptions.length
        ? el('div', {}, el('p', { text: t('sum.fix', language) }), el('ul', {}, summary.misconceptions.map((m) => el('li', { text: m }))))
        : null,
      summary.resolved ? el('p', { class: 'resolved', text: t('sum.resolved', language, { n: summary.resolved }) }) : null);
  });
}
