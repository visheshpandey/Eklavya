// What counts as "really happened" for the guided demo's rows. Pure, so it can be tested without a browser.

/**
 * The mentor answered the student: the student said something first, then a finished (not the instant local greeting) mentor message
 * with words in it. The same rule covers the live voice call, the typed notes-based reply and the text-mode test, because all of them end
 * up as messages. In the text-mode test the student answers by tapping an option, which adds no "You" bubble: `answered` says an answer
 * was graded, which counts as the student having spoken.
 * @param {{role: string, text?: string, final?: boolean, local?: boolean}[]} messages
 * @param {boolean} [answered] a tapped answer has been graded in this session
 */
export function tutorReplied(messages, answered = false) {
  let studentSpoke = Boolean(answered);
  for (const message of messages ?? []) {
    if (message.role === 'user' && !message.local) studentSpoke = true;
    else if (message.role === 'tutor' && studentSpoke && message.final && !message.local && String(message.text ?? '').trim()) return true;
  }
  return false;
}

/** The test reached its summary (the server's `test_summary` event puts an object in the session; a new question clears it). */
export const testFinished = (summary) => Boolean(summary);
