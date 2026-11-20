// A calm, non-blocking note at the top of the page while the free backend wakes up (see lib/warmup.js):
//   - nothing at all if the server answers within 3 s;
//   - "Waking up Eklavya... this takes about a minute the first time.";
//   - then "Eklavya is ready", which goes away after 2 s;
//   - or, if the server never answers, a sentence that says so and a Retry button.
import { el, render } from '../lib/dom.js';
import { MESSAGES } from '../lib/warmup.js';

export function mountWakeToast({ root, warmup, schedule = (fn, ms) => setTimeout(fn, ms), cancel = (id) => clearTimeout(id), hideAfterMs = 2000 }) {
  let hideTimer = null;
  function draw(state) {
    cancel(hideTimer); hideTimer = null;
    if (state === 'waking') {
      root.dataset.state = 'waking'; root.hidden = false;
      render(root, el('span', { class: 'wake-dot', 'aria-hidden': 'true' }), el('span', { text: MESSAGES.waking }));
    } else if (state === 'ready' && warmup.wasWaking()) {
      root.dataset.state = 'ready'; root.hidden = false;
      render(root, el('span', { text: MESSAGES.ready }));
      hideTimer = schedule(() => { root.hidden = true; render(root); }, hideAfterMs);
    } else if (state === 'slow') {
      root.dataset.state = 'slow'; root.hidden = false;
      render(root, el('span', { text: MESSAGES.slow }), el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => warmup.retry() }, 'Retry'));
    } else {
      root.hidden = true; render(root);   // checking (a quick answer) or a Retry that has just started
    }
  }
  // a modal dialog (the sign-in screen) blocks everything outside it, so while one is open the note lives inside it, where its Retry can be pressed
  const home = () => document.querySelector?.('dialog[open]') ?? document.body;
  const place = () => { const target = home(); if (target && root.parentElement !== target) target.append(root); };
  const watcher = typeof MutationObserver === 'function' ? new MutationObserver(place) : null;
  watcher?.observe(document.body, { attributes: true, attributeFilter: ['open'], childList: true, subtree: true });   // also when the dialog redraws itself and drops the note
  const stopState = warmup.onChange((state) => { place(); draw(state); });
  place();
  draw(warmup.state());
  return { stop() { stopState(); watcher?.disconnect(); } };
}
