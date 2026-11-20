// Progress: achievements. Earned badges are lit; locked ones show how far along you are ("3 of 7").
import { el, render } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { badgeProgressText } from '../lib/progress-text.js';
import { t } from '../lib/strings.js';

const ICONS = { fire: 'fire', trophy: 'trophy', cards: 'cards', microphone: 'microphone', users: 'student', chat: 'chats-circle' };

export function mountBadges({ root, onLoad, getLanguage = () => 'english' }) {
  async function refresh() {
    let data;
    try { data = await onLoad(); } catch { return; }   // a quiet failure: the last badges stay
    const language = getLanguage();
    render(root,
      el('p', { class: 'hint', text: t('badges.earnedCount', language, { earned: data.earned, total: data.total }) }),
      el('ul', { class: 'badge-grid' }, data.badges.map((b) => el('li', { class: `badge${b.earned ? ' is-earned' : ''}` },
        el('span', { class: 'badge-icon', 'aria-hidden': 'true' }, icon(ICONS[b.icon] ?? 'trophy', { size: 22 })),
        el('strong', { text: language === 'hindi' ? t(`badge.${b.id}`, language) : b.title }),
        el('span', { class: 'hint', text: b.earned ? t('badges.earned', language) : language === 'hindi' ? t('badges.progress', language, { progress: b.progress, goal: b.goal }) : badgeProgressText(b) })))));
  }
  return { refresh };   // loaded when Progress opens (lib/screen-loads.js), not at page load
}
