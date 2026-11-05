// Full-screen call: the avatar, what Eklavya just said, and the few buttons that matter during a call.
// It opens by itself when a call starts on a phone, and from "Full screen" anywhere else. Minimise returns to the
// normal Study screen with the call still running; ending the call closes it.
import { el, render } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/strings.js';
import { selectBoardIndex, selectLanguage, selectLive, selectMessages, selectQuestion, selectSessionActive, selectSummary, selectVoiceStatus } from '../state/selectors.js';
import { isConnecting, statusKey } from '../lib/voice-phase.js';

const PHONE = '(max-width: 48rem)';

export function mountCallScreen({ store, root, frame, openButton, onEnd, onPhoto }) {
  let open = false;
  const stage = el('div', { class: 'call-avatar' });
  const home = frame.parentElement;   // where the frame lives on the Study screen
  const status = el('p', { class: 'call-status', role: 'status' });
  const caption = el('p', { class: 'call-caption', 'aria-live': 'off' });
  const file = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true,
    onchange: async () => { const chosen = file.files[0]; file.value = ''; if (chosen) await onPhoto(chosen); } });
  const label = (text) => el('span', { class: 'visually-hidden', text });
  const minimise = el('button', { class: 'call-btn', type: 'button', onclick: () => set(false) }, icon('arrow-left', { size: 22 }), label('Back to the study screen'));
  const photo = el('button', { class: 'call-btn', type: 'button', onclick: () => file.click() }, icon('camera', { size: 22 }), label('Show a photo'));
  const end = el('button', { class: 'call-btn call-end', type: 'button', onclick: onEnd }, icon('stop', { size: 26 }), label('End the call'));
  const liveText = document.createTextNode('Live');
  render(root, el('div', { class: 'call-top' }, minimise, el('span', { class: 'live-tag' }, el('span', { class: 'live-dot', 'aria-hidden': 'true' }), liveText)),
    stage, status, caption, el('div', { class: 'call-actions' }, photo, end), file);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Call with Eklavya');

  function set(next) {
    open = next && selectSessionActive(store.getState());
    root.hidden = !open;
    if (open) stage.append(frame); else if (frame.parentElement !== home) home.prepend(frame);   // the same frame, full screen, with the controls over it
    document.documentElement.classList.toggle('in-call', open);
    if (open) end.focus();
  }

  function draw() {
    const state = store.getState();
    const language = selectLanguage(state);
    const live = selectLive(state);
    status.textContent = t(statusKey({ status: selectVoiceStatus(state), live }), language);
    status.classList.toggle('is-connecting', isConnecting({ status: selectVoiceStatus(state), live }));
    liveText.textContent = live.ready ? 'Live' : 'Connecting…';
    const last = [...selectMessages(state)].reverse().find((m) => m.role === 'tutor');
    caption.textContent = last?.text ?? '';
    openButton.hidden = !selectSessionActive(state);
  }

  let wasActive = false;
  store.select(selectSessionActive, (active) => {
    if (active && !wasActive && globalThis.matchMedia?.(PHONE).matches && !selectLive(store.getState()).text) set(true);   // a call on a phone fills the screen (text mode is not a call)
    if (!active) set(false);
    wasActive = active;
    draw();
  });
  store.select(selectVoiceStatus, draw);
  store.select(selectLive, draw);
  store.select(selectLive, (live) => { if (live.text) set(false); });   // the voice gave way to text mode: there is no call to show full screen
  // a question, a board or the summary appeared: back to the normal Study screen, where it can be seen and answered (the call carries on)
  store.select(selectQuestion, (question) => { if (question && open) set(false); });
  store.select(selectBoardIndex, (index) => { if (index >= 0 && open) set(false); });
  store.select(selectSummary, (summary) => { if (summary && open) set(false); });
  store.select(selectMessages, draw);
  store.select(selectLanguage, draw);
  openButton.addEventListener('click', () => set(true));
  root.addEventListener('keydown', (event) => { if (event.key === 'Escape') set(false); });
  root.hidden = true;
  return {};
}
