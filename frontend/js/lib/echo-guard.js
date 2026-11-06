// Speech "heard" while the tutor is talking (or just stopped) is the tutor's own voice coming back through the speakers, not the student.
// The server already ignores it; this keeps it off the screen too. Pure, so it can be tested.
export const TAIL_MS = 800;       // after the tutor's audio ends
export const SHORT_MS = 1500;     // one word this soon after the tutor is treated as echo

const words = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean);

/** Should this spoken (not typed) line be ignored? `msSinceSpeech` is how long ago the tutor's audio ended. */
export function ignoreSpokenLine({ testOpen, speaking, msSinceSpeech, text, lastTutorText = '' }) {
  if (!words(text).length) return false;
  if (testOpen && (speaking || msSinceSpeech < TAIL_MS)) return true;
  if (words(text).length < 2 && (speaking || msSinceSpeech < SHORT_MS)) return true;
  const said = String(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const last = String(lastTutorText).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return said.length >= 8 && last.includes(said);   // a piece of what the tutor just said
}
