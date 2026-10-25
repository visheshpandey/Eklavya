// Mastery bars, misconception alerts and the agent decision log, drawn from GET /api/dashboard.
import { el, $ } from './dom.js';
import { api } from './api.js';
import { showMission } from './mission.js';

export const handlers = { topic: null };
let selected = null;
export function markSelected(id) {
  selected = id;
  document.querySelectorAll('.mrow').forEach((r) => r.classList.toggle('selected', r.id === 'm' + id));
}

const level = (v) => (v < 50 ? 'low' : v < 70 ? 'mid' : 'high');

export async function refreshDashboard() {
  const d = await api('/api/dashboard?user_id=1');
  renderMastery(d);
  renderAlerts(d);
  renderLog(d.agent_log);
  renderHistory(d.quiz_history);
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
    let row = $('m' + m.topic_id);
    if (!row) {
      row = el('div', { id: 'm' + m.topic_id, role: 'button', tabindex: '0', title: 'Open this topic' });
      const open = () => handlers.topic && handlers.topic(m.topic_id);
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }
    row.className = 'mrow ' + level(v) + (m.topic_id === weakest ? ' weakest' : '') + (m.topic_id === selected ? ' selected' : '');
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
    el('span', { class: 'obs', text: 'Saw: ' + e.observation }),
    el('span', { class: 'dec', text: 'Decided: ' + e.decision }),
    e.action_taken ? el('span', { class: 'act', text: 'Did: ' + e.action_taken }) : null)));
}

function renderHistory(h) {
  $('history').replaceChildren(...(h.length
    ? h.slice(0, 6).map((a) => el('li', { class: a.is_correct ? 'right' : 'wrong' },
        el('strong', { text: (a.is_correct ? 'Correct' : 'Wrong') + ' · ' + a.topic_name }),
        el('span', { text: a.question.length > 90 ? a.question.slice(0, 90) + '…' : a.question }),
        el('span', { class: 'delta', text: a.mastery_before + '% → ' + a.mastery_after + '%' })))
    : [el('li', { class: 'empty', text: 'Answer a quiz question to see your history.' })]));
}
