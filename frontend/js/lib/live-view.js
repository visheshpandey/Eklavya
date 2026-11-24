// Pure helpers for the live dashboard (live.html), so they are tested without a browser.
export const REFRESH_MS = 3000;

const LABELS = [['students', 'Students'], ['notes', 'Notes uploaded'], ['questions', 'Questions asked'], ['quiz_answers', 'Quiz answers'],
  ['flashcards', 'Flashcards made'], ['voice_sessions', 'Voice sessions'], ['mock_exams', 'Mock exams'], ['groups', 'Study groups']];

/** [label, value] rows in a fixed order; a missing number shows as 0. */
export const totalRows = (totals = {}) => LABELS.map(([key, label]) => [label, Number(totals[key]) || 0]);

/** Bar heights in percent, scaled to the busiest minute. A quiet minute is 0 and a busy one is at least 8% so it stays visible. */
export function barHeights(counts = []) {
  const top = Math.max(0, ...counts);
  return counts.map((n) => (n <= 0 || top === 0 ? 0 : Math.max(8, Math.round((n / top) * 100))));
}

/** "just now", "42s ago", "5 min ago", "2 h ago" from a past time in ms and the current time in ms. */
export function ago(thenMs, nowMs) {
  const seconds = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return `${Math.floor(seconds / 3600)} h ago`;
}

/** The feed lines ready to draw. `nowMs` is the server's own clock, so the page's clock being wrong never matters. */
export const feedItems = (feed = [], nowMs) => feed.map((event) => ({
  kind: event.kind, who: event.who, what: event.what, when: ago(Date.parse(`${String(event.at).replace(' ', 'T')}Z`), nowMs),
}));

export function statusText(ok, when) {
  if (!ok) return 'Reconnecting…';
  return `Live · updated ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}
