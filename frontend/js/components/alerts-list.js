// Open misconceptions (or a note that there are none / they were resolved).
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { selectDashboard } from '../state/selectors.js';

export function mountAlertsList({ store, root }) {
  store.select(selectDashboard, (dashboard) => {
    if (!dashboard) { replaceContent(root); return; }
    const open = dashboard.alerts.filter((a) => a.type === 'misconception');
    replaceContent(root, ...(open.length
      ? open.map((a) => el('li', { class: `alert ${a.severity}` }, icon('warning', { size: 20 }),
          el('div', {}, el('strong', { text: a.topic }), el('span', { text: a.message }))))
      : [el('li', { class: 'empty', text: dashboard.misconceptions_resolved
          ? `${dashboard.misconceptions_resolved} misconception(s) resolved. Nice work.`
          : 'No misconceptions detected yet.' })]));
  });
}
