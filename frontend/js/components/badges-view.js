// Progress: achievements. Earned badges are lit; locked ones show how far along you are ("3 of 7").
import { el, render } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { badgeProgressText } from '../lib/progress-text.js';

const ICONS = { fire: 'fire', trophy: 'trophy', cards: 'cards', microphone: 'microphone', users: 'student', chat: 'chats-circle' };

export function mountBadges({ root, onLoad }) {
  async function refresh() {
    let data;
    try { data = await onLoad(); } catch { return; }   // a quiet failure: the last badges stay
    render(root,
      el('p', { class: 'hint', text: `${data.earned} of ${data.total} earned` }),
      el('ul', { class: 'badge-grid' }, data.badges.map((b) => el('li', { class: `badge${b.earned ? ' is-earned' : ''}` },
        el('span', { class: 'badge-icon', 'aria-hidden': 'true' }, icon(ICONS[b.icon] ?? 'trophy', { size: 22 })),
        el('strong', { text: b.title }),
        el('span', { class: 'hint', text: b.earned ? 'Earned' : badgeProgressText(b) })))));
  }
  refresh();
  return { refresh };
}
