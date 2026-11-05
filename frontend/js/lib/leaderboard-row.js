// One leaderboard row, shared by the demo circle and real study groups: rank, an initial, "Name · 6-day streak, 77% mastery", points.
import { el } from './dom.js';

/** The detail line: a leading separator so the name never runs into it ("Aarav · 6-day streak, 77% mastery"). */
export const detailText = ({ streak, mastery }) => `${streak}-day streak, ${mastery}% mastery`;

/** @param {{rank: number, name: string, you: boolean, streak: number, mastery: number}} row  @param {string} points e.g. "+21 pts" */
export function leaderboardRow(row, points) {
  return el('li', { class: `lb-row${row.you ? ' is-you' : ''}` },
    el('span', { class: 'lb-rank', text: String(row.rank) }),
    el('span', { class: 'lb-av', 'aria-hidden': 'true', text: (row.name || '?').slice(0, 1).toUpperCase() }),
    el('span', { class: 'lb-who' },
      el('span', { class: 'lb-name', text: row.you ? `${row.name} (you)` : row.name }),
      el('span', { class: 'lb-sep', 'aria-hidden': 'true', text: '·' }),
      el('span', { class: 'hint', text: detailText(row) })),
    el('strong', { text: points }));
}
