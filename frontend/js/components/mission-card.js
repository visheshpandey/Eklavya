// The study mission: on the Progress screen (the current one) and in Study (the one given at the end of this session).
import { el, render as replaceContent } from '../lib/dom.js';
import { selectMission } from '../state/selectors.js';

export function mountMissionCard({ store, root, select = selectMission, heading = 'Next mission' }) {
  store.select(select, (mission) => {
    root.hidden = !mission;
    if (!mission) { replaceContent(root); return; }
    replaceContent(root,
      el('div', { class: 'mission-head' },
        el('p', { class: 'meta', text: `${heading}, ${mission.duration_minutes} minutes` }),
        mission.priority ? el('span', { class: `pill ${mission.priority.toLowerCase()}`, text: `${mission.priority} priority` }) : null),
      el('h3', { text: mission.title }),
      el('p', { text: mission.reason }),
      el('ol', { class: 'tasks' }, mission.tasks.map((task) => el('li', { text: task }))));
  });
}
