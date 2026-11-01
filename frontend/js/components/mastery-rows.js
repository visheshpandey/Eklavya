// "Mastery by subject": one row per notes document with its average mastery, from the dashboard's topics.
import { el, render } from '../lib/dom.js';
import { groupSubjects, masteryStatus } from '../lib/subjects.js';
import { selectDashboard } from '../state/selectors.js';

const FILL = { strong: 'var(--ok-fill)', grow: 'var(--ochre)', low: 'var(--terracotta)' };

export function mountMasteryRows({ store, root }) {
  store.select(selectDashboard, (dashboard) => {
    const subjects = groupSubjects(dashboard?.mastery ?? []);
    if (!subjects.length) { render(root, el('p', { class: 'hint', text: 'Your subjects and their mastery appear here once you add notes.' })); return; }
    render(root, subjects.map((s) => el('div', { class: 'mrow' },
      el('div', {}, el('b', { text: s.name }), el('small', { text: `${s.topics} topic${s.topics === 1 ? '' : 's'}` })),
      el('span', { class: 'bar', role: 'img', 'aria-label': `${s.mastery}% mastery, ${masteryStatus(s.mastery).label}` }, el('i', { style: `width:${s.mastery}%;background:${FILL[masteryStatus(s.mastery).key]}` })),
      el('strong', { text: `${s.mastery}%` }))));
  });
}
