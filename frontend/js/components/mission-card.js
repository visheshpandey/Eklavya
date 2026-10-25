// The current study mission.
import { el, render } from '../lib/dom.js';
import { selectMission } from '../state/selectors.js';

export function mountMissionCard({ store, root }) {
  store.select(selectMission, (mission) => {
    root.hidden = !mission;
    if (!mission) { root.replaceChildren(); return; }
    render(root,
      el('div', { class: 'card-title' },
        el('span', { text: 'Your study mission' }),
        el('span', { class: `pill ${mission.priority.toLowerCase()}`, text: `${mission.priority} priority` })),
      el('h3', { text: mission.title }),
      el('p', { class: 'meta', text: `${mission.duration_minutes} minutes` }),
      el('p', { class: 'reason', text: mission.reason }),
      el('ol', { class: 'tasks' }, mission.tasks.map((task) => el('li', { text: task }))),
    );
  });
}
