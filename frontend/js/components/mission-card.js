// The study mission: on the Progress screen (the current one) and in Study (the one given at the end of this session).
import { el, render as replaceContent } from '../lib/dom.js';
import { selectDashboard, selectMission } from '../state/selectors.js';
import { weakestLine } from '../lib/weakest.js';

export function mountMissionCard({ store, root, select = selectMission, heading = 'Next mission', showWeakest = false }) {
  const draw = (mission) => {
    root.hidden = !mission;
    if (!mission) { replaceContent(root); return; }
    replaceContent(root,
      el('div', { class: 'mission-head' },
        el('p', { class: 'meta', text: `${heading}, ${mission.duration_minutes} minutes` }),
        mission.priority ? el('span', { class: `pill ${mission.priority.toLowerCase()}`, text: `${mission.priority} priority` }) : null),
      showWeakest && weakestLine(selectDashboard(store.getState())?.mastery) ? el('p', { class: 'meta weakest', text: weakestLine(selectDashboard(store.getState()).mastery) }) : null,
      el('h3', { text: mission.title }),
      el('p', { text: mission.reason }),
      el('ol', { class: 'tasks' }, mission.tasks.map((task) => el('li', { text: task }))));
  };
  store.select(select, draw);
  if (showWeakest) store.select(selectDashboard, () => draw(select(store.getState())));   // the weakest line follows the table
}
