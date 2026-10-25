// Mastery bars, misconception alerts and the agent decision log, drawn from GET /api/dashboard.
import { el, $ } from './dom.js';
import { api } from './api.js';
import { showMission } from './mission.js';

const level = (v) => (v < 50 ? 'low' : v < 70 ? 'mid' : 'high');

export async function refreshDashboard() {
  const d = await api('/api/dashboard?user_id=1');
  renderMastery(d);
  renderAlerts(d);
  renderLog(d.agent_log);
  if (d.mission) showMission(d.mission);
  return d;
}

function renderMastery(d) {
  const box = $('mastery');
  if (!d.mastery.length) {
    box.replaceChildren(el('p', { class: 'empty', text: 'No notes yet. Load the demo notes or upload your own.' }));
    return;
  }
  const weakest = d.weak_topics[0] && d.weak_topics[0].topic_id;
  box.replaceChildren(...d.mastery.map((m) => {
    const v = Math.round(m.mastery_score);
    const row = $('m' + m.topic_id) || el('div', { id: 'm' + m.topic_id });
    row.className = 'mrow ' + level(v) + (m.topic_id === weakest ? ' weakest' : '');
    let fill = row.querySelector('.mfill');
    if (!fill) {   // keep the same element afterwards so the width change animates
      row.replaceChildren(
        el('span', { class: 'mname' }),
        el('span', { class: 'mtrack' }, el('span', { class: 'mfill', style: 'width:0%' })),
        el('span', { class: 'mval' }));
      fill = row.querySelector('.mfill');
      requestAnimationFrame(() => { fill.style.width = v + '%'; });
    } else {
      fill.style.width = v + '%';
    }
    row.querySelector('.mval').textContent = v + '%';
    row.querySelector('.mname').textContent = m.topic_name;
    return row;
  }));
}

function renderAlerts(d) {
  const items = d.alerts.filter((a) => a.type === 'misconception');
  $('alerts').replaceChildren(...(items.length
    ? items.map((a) => el('li', { class: 'alert ' + a.severity },
        el('strong', { text: a.topic }), el('span', { text: ' ' + a.message })))
    : [el('li', { class: 'empty', text: d.misconceptions_resolved
        ? d.misconceptions_resolved + ' misconception(s) resolved. Nice work.'
        : 'No misconceptions detected yet.' })]));
}

function renderLog(log) {
  $('log').replaceChildren(...log.slice(0, 8).map((e) => el('li', {},
    el('span', { class: 'agent', text: e.agent_name.replace('_', ' ') }),
    el('span', { class: 'obs', text: e.observation }),
    el('span', { class: 'dec', text: '→ ' + e.decision }),
    e.action_taken ? el('span', { class: 'act', text: e.action_taken }) : null)));
}
