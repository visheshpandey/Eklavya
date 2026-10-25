// The last few quiz answers with their mastery change.
import { el, render as replaceContent } from '../lib/dom.js';
import { truncate } from '../lib/format.js';
import { selectDashboard } from '../state/selectors.js';

const SHOWN = 6;

export function mountHistoryList({ store, root }) {
  store.select(selectDashboard, (dashboard) => {
    const history = dashboard?.quiz_history ?? [];
    replaceContent(root, ...(history.length
      ? history.slice(0, SHOWN).map((a) => el('li', { class: a.is_correct ? 'right' : 'wrong' },
          el('span', { class: 'verdict', text: `${a.is_correct ? 'Correct' : 'Wrong'}: ${a.topic_name}` }),
          el('span', { text: truncate(a.question, 90) }),
          el('span', { class: 'delta', text: `Mastery ${a.mastery_before}% to ${a.mastery_after}%` })))
      : [el('li', { class: 'empty', text: 'Answer a quiz question and your history shows up here.' })]));
  });
}
