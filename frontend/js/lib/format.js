// Small pure helpers for display text.

export const round1 = (n) => Math.round(n * 10) / 10;

export const truncate = (text, max) => (text.length > max ? text.slice(0, max) + '…' : text);

/** Bucket a mastery percentage for colouring: 'low' < 50 <= 'mid' < 70 <= 'high'. */
export const masteryLevel = (percent) => (percent < 50 ? 'low' : percent < 70 ? 'mid' : 'high');

/** "+9.3" / "-5" / "0" */
export const signed = (n) => (n > 0 ? '+' + n : String(n));
