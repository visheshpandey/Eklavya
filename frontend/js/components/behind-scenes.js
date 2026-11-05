// "Behind the scenes": the real decision log, real counts and how the pieces fit. Loaded when the fold is opened, so it is always current.
import { el, render } from '../lib/dom.js';
import { describeUsage } from '../lib/behind-scenes.js';
import { decisionItem } from './decision-log.js';
import { diagram } from './impact-view.js';

export function mountBehindScenes({ root, details, load }) {
  async function draw() {
    render(root, el('p', { class: 'hint', role: 'status', text: 'Loading…' }));
    let report;
    try { report = await load(); } catch { render(root, el('p', { class: 'hint', text: 'Could not load this right now. Try again in a moment.' })); return; }
    render(root,
      el('p', { class: 'hint', text: 'Live log of what each AI agent saw, decided and did.' }),
      el('div', { class: 'bts-stats' }, describeUsage(report).map((stat) => el('div', { class: 'bts-stat' },
        el('span', { class: 'mono', text: stat.label }), el('b', { text: stat.value }), el('small', { text: stat.note })))),
      el('div', { class: 'impact-how' }, el('span', { class: 'mono', text: 'What the agents decided for you, newest first' }),
        report.decisions.length ? el('ul', { class: 'list log' }, report.decisions.map(decisionItem))
          : el('p', { class: 'hint', text: 'Nothing yet. Ask a question or start a lesson and each step appears here.' })),
      el('div', { class: 'impact-how' }, el('span', { class: 'mono', text: 'How it fits together' }), diagram()));
  }
  details.addEventListener('toggle', () => { if (details.open) draw(); });
}
