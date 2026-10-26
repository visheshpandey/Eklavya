// "Download study pack": a printable summary (mission, mastery, mistakes to fix, this session's whiteboards,
// flashcards). It uses the browser's print dialog, where "Save as PDF" makes the file; no PDF library needed.
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/strings.js';
import { selectBoards, selectDashboard, selectLanguage, selectMission } from '../state/selectors.js';

function boardText(board) {
  if (board.kind === 'formula') return [board.formula, ...board.items, board.result].filter(Boolean).join('\n');
  if (board.kind === 'steps') return board.items.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return [board.headers.join(' | '), ...board.rows.map((r) => r.join(' | '))].join('\n');
}

/** The printable pack as DOM (pure apart from creating elements, so it can be checked in a test page). */
export function buildPack({ dashboard, mission, boards, cards, date = new Date() }) {
  const mastery = dashboard?.mastery ?? [];
  const mistakes = (dashboard?.alerts ?? []).filter((a) => a.type === 'misconception');
  return [
    el('h1', { text: 'Eklavya study pack' }),
    el('p', { class: 'pack-date', text: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) }),
    mission ? el('section', {}, el('h2', { text: `Mission: ${mission.title}` }), el('p', { text: mission.reason }),
      el('ol', {}, mission.tasks.map((task) => el('li', { text: task })))) : null,
    mastery.length ? el('section', {}, el('h2', { text: 'Mastery' }),
      el('table', {}, el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: 'Topic' }), el('th', { scope: 'col', text: 'Mastery' }))),
        el('tbody', {}, mastery.map((m) => el('tr', {}, el('td', { text: m.topic_name }), el('td', { text: `${Math.round(m.mastery_score)}%` })))))) : null,
    mistakes.length ? el('section', {}, el('h2', { text: 'Mistakes to fix' }),
      el('ul', {}, mistakes.map((m) => el('li', {}, el('strong', { text: `${m.topic}: ` }), m.message)))) : null,
    boards.length ? el('section', {}, el('h2', { text: 'Whiteboards from this session' }),
      boards.map((b) => el('div', { class: 'pack-board' }, el('h3', { text: b.title }), el('pre', { text: boardText(b) })))) : null,
    cards.length ? el('section', {}, el('h2', { text: 'Flashcards' }),
      el('dl', {}, cards.flatMap((c) => [el('dt', { text: `${c.topic}: ${c.front}` }), el('dd', { text: c.back })]))) : null,
  ];
}

export function mountStudyPack({ store, button, packRoot, loadAllCards }) {
  store.select(selectLanguage, (language) => {
    replaceContent(button, icon('printer', { size: 18 }), t('progress.pack', language));
  });
  button.addEventListener('click', async () => {
    const state = store.getState();
    const cards = await loadAllCards().catch(() => []);
    replaceContent(packRoot, buildPack({ dashboard: selectDashboard(state), mission: selectMission(state), boards: selectBoards(state), cards }));
    window.print();
  });
}
