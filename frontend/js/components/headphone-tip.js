// "Use headphones": without them the microphone hears the tutor and can mistake its voice for the student's. Shown once in the Study room, dismissible.
import { el, render } from '../lib/dom.js';

const KEY = 'eklavya.headphones';

export function mountHeadphoneTip({ root, storage = globalThis.localStorage }) {
  const seen = () => { try { return storage.getItem(KEY) === '1'; } catch { return false; } };
  const remember = () => { try { storage.setItem(KEY, '1'); } catch { /* it may show again next visit */ } };
  function close() { remember(); root.hidden = true; }
  return {
    /** Call when the Study room opens. */
    show() {
      if (seen() || !root.hidden) return;
      render(root, el('span', { text: 'Use headphones for the best experience, or tap Captions and answer by clicking.' }),
        el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: close }, 'Got it'));
      root.hidden = false;
    },
    close,
  };
}
