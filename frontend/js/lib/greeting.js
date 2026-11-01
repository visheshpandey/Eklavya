// The Today greeting: time-of-day wording, the date line and the first letter for the avatar circle (pure).

/** The part of the day: late (0 to 4), morning (5 to 11), afternoon (12 to 16) or evening (17 to 23). The only place this is decided. */
export function dayPart(hour) {
  if (hour < 5) return 'late';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** The interface-text key of the greeting for `date` ("today.late", "today.morning"...), so every screen words it in the chosen language. */
export const greetingKey = (date = new Date()) => `today.${dayPart(date.getHours())}`;

const WORDS = { late: 'Up late', morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' };

/** English wording without punctuation ("Good evening"): the caller adds the name and the comma. */
export const greetingFor = (date = new Date()) => WORDS[dayPart(date.getHours())];

/** "MONDAY, NOVEMBER 02 · A LITTLE PROGRESS ADDS UP" (the mono label above the greeting). */
export function dateLine(date = new Date(), locale = 'en-US') {
  return `${date.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: '2-digit' }).toUpperCase()} · A LITTLE PROGRESS ADDS UP`;
}

/** One capital letter for the round avatar; "E" when there is no name yet. */
export function initialOf(name) {
  const letter = String(name ?? '').trim().charAt(0);
  return letter ? letter.toUpperCase() : 'E';
}

/** The first word of a name, for "Welcome back, Asha." */
export const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || '';
