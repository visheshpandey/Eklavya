// Open misconceptions (or a note that there are none / they were resolved).
import { el } from '../lib/dom.js';
import { selectDashboard } from '../state/selectors.js';

export function mountAlertsList({ store, root }) {
  store.select(selectDashboard, (dashboard) => {
    if (!dashboard) { root.replaceChildren(); return; }
    const open = dashboard.alerts.filter((a) => a.type === 'misconception');
    root.replaceChildren(...(open.length
      ? open.map((a) => el('li', { class: `alert ${a.severity}` }, el('strong', { text: a.topic }), el('span', { text: ` ${a.message}` })))
      : [el('li', { class: 'empty', text: dashboard.misconceptions_resolved
          ? `${dashboard.misconceptions_resolved} misconception(s) resolved. Nice work.`
          : 'No misconceptions detected yet.' })]));
  });
}
