// The Study room opens the voice connection in the background. If it is not ready after 20 s this note says so and offers text,
// so the student is never left waiting: "Continue with text" starts the next session without the voice.
import { el, render } from '../lib/dom.js';

export const VOICE_WAIT_MS = 20000;

export function mountVoiceNote({ root, isReady, isBusy = () => false, onText, schedule = (fn, ms) => setTimeout(fn, ms), cancel = (id) => clearTimeout(id), waitMs = VOICE_WAIT_MS }) {
  let timer = null;
  let chosen = false;

  function hide() { root.hidden = true; render(root); }
  function check() {
    timer = null;
    if (chosen || isReady() || isBusy()) { hide(); return; }
    root.hidden = false;
    render(root, el('span', { text: 'Voice is still connecting…' }),
      el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => {
        chosen = true; onText();
        render(root, el('span', { text: 'Text mode is on. Pick Learn, Test or another mode and answer by typing or tapping.' }));
      } }, 'Continue with text'));
  }
  return {
    /** The Study room opened: start counting. */
    show() { chosen = false; cancel(timer); hide(); if (isReady()) return; timer = schedule(check, waitMs); },
    /** The connection became ready (or a session started): the note is not needed. */
    ready() { cancel(timer); timer = null; if (!chosen) hide(); },
    leave() { cancel(timer); timer = null; chosen = false; hide(); },
  };
}
