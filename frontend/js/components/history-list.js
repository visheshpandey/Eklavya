// The last few quiz answers with their mastery change.
import { el } from '../lib/dom.js';
import { truncate } from '../lib/format.js';
import { selectDashboard } from '../state/selectors.js';

const SHOWN = 6;

export function mountHistoryList({ store, root }) {
  store.select(selectDashboard, (dashboard) => {
    const history = dashboard?.quiz_history ?? [];
    root.replaceChildren(...(history.length
      ? history.slice(0, SHOWN).map((a) => el('li', { class: a.is_correct ? 'right' : 'wrong' },
          el('strong', { text: `${a.is_correct ? 'Correct' : 'Wrong'} · ${a.topic_name}` }),
          el('span', { text: truncate(a.question, 90) }),
          el('span', { class: 'delta', text: `${a.mastery_before}% → ${a.mastery_after}%` })))
      : [el('li', { class: 'empty', text: 'Answer a quiz question to see your history.' })]));
  });
}
