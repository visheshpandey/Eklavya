// One-letter shortcuts must never fire while someone is typing a sentence. A shortcut only runs when:
//  - the focus is not in a field (input, textarea, select, contenteditable) and no dialog is open,
//  - no Ctrl, Meta or Alt is held and an input method (IME) is not composing,
//  - the key is not part of a burst of typing: nothing printable was pressed in the last `quietMs`,
//  - and no second letter follows within `settleMs` (so even the first letter of a typed sentence does nothing).
// Pure and timer-injected so it can be tested without a browser.

export const isEditable = (target) => typeof Element !== 'undefined' && target instanceof Element
  && Boolean(target.closest('input, textarea, select, [contenteditable]'));

/** A key that types a character (not Enter, Tab, arrows, F-keys, and not with Ctrl/Meta/Alt). */
export const isPrintable = (event) => typeof event.key === 'string' && event.key.length === 1
  && !event.ctrlKey && !event.metaKey && !event.altKey;

export function createShortcutGuard({ quietMs = 1500, settleMs = 300, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let last = -Infinity;   // when a printable key was last pressed outside a field
  let pending = null;     // a shortcut waiting out `settleMs`

  const cancel = () => { if (pending != null) { clearTimer(pending); pending = null; } };

  return {
    /**
     * Decide what a key press does. Returns 'ignored' or 'scheduled' (run() will be called after settleMs).
     * @param {KeyboardEvent} event
     * @param {{editable: boolean, dialogOpen: boolean, run: () => void}} context
     */
    press(event, { editable, dialogOpen, run }) {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return 'ignored';
      if (editable || dialogOpen) { cancel(); return 'ignored'; }
      if (!isPrintable(event)) return 'ignored';
      const at = now();
      const burst = at - last < quietMs;
      last = at;
      cancel();   // a second key while one is waiting means this is typing
      if (burst) return 'ignored';
      pending = setTimer(() => { pending = null; run(); }, settleMs);
      return 'scheduled';
    },
    /** A key that is not a shortcut still counts as typing: it cancels a waiting shortcut and restarts the quiet time. */
    note(event, { editable = false } = {}) {
      if (editable || event.isComposing || !isPrintable(event)) return;
      last = now();
      cancel();
    },
    cancel,
  };
}

/**
 * What a key does on the Flashcards page (pure): 'flip' for Space, or a rating ('again' for 1, 'hard' for 2, 'known' for 3).
 * Only while that page is showing, no field is focused, no dialog is open, no Ctrl/Meta/Alt is held, and (for a rating) the card is flipped.
 * @returns {'flip' | 'again' | 'hard' | 'known' | null}
 */
export function flashcardKey(event, { view, editable, dialogOpen, flipped, summary }) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return null;
  if (view !== 'flashcards' || editable || dialogOpen) return null;
  if (event.key === ' ') return 'flip';
  const rating = { 1: 'again', 2: 'hard', 3: 'known' }[event.key];
  return rating && flipped && !summary ? rating : null;
}
