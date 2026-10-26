// Finished vivas and debates (newest first): marks out of 10, winner and the one thing to improve.
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/strings.js';
import { selectHistory, selectLanguage } from '../state/selectors.js';

const WINNER_KEY = { student: 'debate.youWon', eklavya: 'debate.eklavyaWon', draw: 'debate.draw' };

export function mountResultsList({ store, root }) {
  function draw() {
    const state = store.getState();
    const history = selectHistory(state);
    const language = selectLanguage(state);
    const items = [
      ...(history?.vivas ?? []).map((v) => ({ when: v.finished_at, node: el('li', { class: 'result-item' },
        icon('student', { size: 20 }),
        el('div', {},
          el('strong', { text: t('results.viva', language, { topic: v.topic ?? '' }) }),
          el('span', { class: 'result-score', text: ` ${v.marks}/${v.out_of}` }),
          v.improve ? el('p', { class: 'hint', text: v.improve }) : null)) })),
      ...(history?.debates ?? []).map((d) => ({ when: d.finished_at, node: el('li', { class: 'result-item' },
        icon('scales', { size: 20 }),
        el('div', {},
          el('strong', { text: t('results.debate', language, { topic: d.topic ?? '' }) }),
          el('span', { class: 'result-score', text: ` ${t(WINNER_KEY[d.winner] ?? 'debate.draw', language)} (${d.student_score} vs ${d.tutor_score})` }),
          d.improve ? el('p', { class: 'hint', text: d.improve }) : null)) })),
    ].sort((a, b) => String(b.when).localeCompare(String(a.when)));
    replaceContent(root, items.length ? items.map((i) => i.node) : el('li', { class: 'empty', text: t('results.empty', language) }));
  }
  store.select(selectHistory, draw);
  store.select(selectLanguage, draw);
}
