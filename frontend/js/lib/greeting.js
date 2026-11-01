// The Today greeting: time-of-day wording, the date line and the first letter for the avatar circle (pure).

/** "Up late," before 5, then morning, afternoon, evening. */
export function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Up late,';
  if (hour < 12) return 'Good morning,';
  if (hour < 17) return 'Good afternoon,';
  return 'Good evening,';
}

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
