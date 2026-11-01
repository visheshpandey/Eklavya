// Patterns to clear up: each open misconception with its level (HIGH / MED / LOW), or a note that there are none / they were resolved.
import { el, render as replaceContent } from '../lib/dom.js';
import { selectDashboard } from '../state/selectors.js';

const LEVEL = { high: ['HIGH', 'lv-hi'], medium: ['MED', 'lv-md'], low: ['LOW', 'lv-lo'] };

export function mountAlertsList({ store, root }) {
  store.select(selectDashboard, (dashboard) => {
    if (!dashboard) { replaceContent(root); return; }
    const open = dashboard.alerts.filter((a) => a.type === 'misconception');
    replaceContent(root, ...(open.length
      ? open.map((a) => {
        const [word, tone] = LEVEL[a.severity] ?? LEVEL.medium;
        return el('li', { class: `miss alert ${a.severity}` }, el('span', { class: `lvl ${tone}`, text: word }),
          el('div', {}, el('b', { text: a.message }), el('small', { text: `${a.topic} · ${a.severity} confidence` })));
      })
      : [el('li', { class: 'empty', text: dashboard.misconceptions_resolved
        ? `${dashboard.misconceptions_resolved} misconception(s) resolved. Nice work.`
        : 'No misconceptions detected yet.' })]));
  });
}
