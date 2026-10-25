// Study mission card.
import { el, $ } from './dom.js';

export function showMission(m) {
  const card = $('mission');
  if (!m) { card.hidden = true; return; }
  const title = m.title || m.mission_title;
  card.replaceChildren(
    el('div', { class: 'card-title' },
      el('span', { text: 'Your study mission' }),
      el('span', { class: 'pill ' + String(m.priority || '').toLowerCase(), text: (m.priority || '') + ' priority' })),
    el('h3', { text: title }),
    el('p', { class: 'meta', text: (m.duration_minutes || 15) + ' minutes' }),
    el('p', { class: 'reason', text: m.reason || '' }),
    el('ol', { class: 'tasks' }, (m.tasks || []).map((t) => el('li', { text: t }))),
  );
  card.hidden = false;
}
