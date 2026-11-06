// What counts as "really happened" for the guided demo's rows. Pure, so it can be tested without a browser.

/**
 * The mentor answered the student: some message from the student came first, then a finished (not the instant local greeting) mentor
 * message with words in it. The same rule covers the live voice call and the typed text-mode fallback, because both end up as messages.
 * @param {{role: string, text?: string, final?: boolean, local?: boolean}[]} messages
 */
export function tutorReplied(messages) {
  let studentSpoke = false;
  for (const message of messages ?? []) {
    if (message.role === 'user' && !message.local) studentSpoke = true;
    else if (message.role === 'tutor' && studentSpoke && message.final && !message.local && String(message.text ?? '').trim()) return true;
  }
  return false;
}

/** The test reached its summary (the server's `test_summary` event puts an object in the session; a new question clears it). */
export const testFinished = (summary) => Boolean(summary);
