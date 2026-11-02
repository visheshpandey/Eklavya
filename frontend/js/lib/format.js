// Small pure helpers for display text.

export const round1 = (n) => Math.round(n * 10) / 10;

export const truncate = (text, max) => (text.length > max ? text.slice(0, max) + '…' : text);

/** Bucket a mastery percentage for colouring: 'low' < 50 <= 'mid' < 70 <= 'high'. */
export const masteryLevel = (percent) => (percent < 50 ? 'low' : percent < 70 ? 'mid' : 'high');

/** "+9.3" / "-5" / "0" */
export const signed = (n) => (n > 0 ? '+' + n : String(n));

/** "1 card", "3 cards": a count with its noun in the right number. */
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2 Nov" from an ISO day ("2026-11-02") or a stored stamp ("2026-11-02 08:15:00", UTC); '' when it is not a date. */
export function shortDate(value) {
  const text = String(value ?? '').trim();
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (day) return `${Number(day[3])} ${MONTHS[Number(day[2]) - 1]}`;
  const moment = new Date(text.replace(' ', 'T') + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? '' : 'Z'));
  return Number.isNaN(moment.getTime()) ? '' : `${moment.getDate()} ${MONTHS[moment.getMonth()]}`;
}
