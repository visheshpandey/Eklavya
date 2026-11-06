// The guided demo: four things a first-time visitor (a judge) does, not just looks at. Each row has a "Do it" button that takes them
// to the real feature; rows tick themselves when the thing really happened (an answer came back in Ask, the mentor replied, a test reached
// its summary, the progress map was opened). Ticks are kept in localStorage, so a reload keeps them, and they are recorded even before the
// card is first shown. Closing the card with the x is final: it does not come back on its own (only the menu item brings it back).
import { el, render } from '../lib/dom.js';

const KEY = 'eklavya.guide';
const DONE_MESSAGE_MS = 8000;   // how long "You have seen everything" stays before the card goes away for good

export const GUIDE_STEPS = [
  { id: 'ask', title: 'Ask your notes', text: 'See an answer with the exact passage it came from.' },
  { id: 'talk', title: 'Talk to your mentor', text: 'Say or type something and get the mentor’s reply.' },
  { id: 'test', title: 'Test yourself', text: 'Answer three questions and reach the summary.' },
  { id: 'progress', title: 'See your progress', text: 'Every topic as a sphere: green strong, gold growing, terracotta weak.' },
];

const fresh = () => ({ open: false, min: false, dismissed: false, finished: false, done: {} });

/** The saved state: {open, min, dismissed, finished, done: {stepId: true}}. Pure, so it can be tested. */
export function readGuide(storage) {
  try {
    const saved = JSON.parse(storage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') {
      return { open: Boolean(saved.open), min: Boolean(saved.min), dismissed: Boolean(saved.dismissed), finished: Boolean(saved.finished), done: { ...(saved.done || {}) } };
    }
  } catch { /* fresh state */ }
  return fresh();
}
export function writeGuide(storage, state) {
  try { storage.setItem(KEY, JSON.stringify(state)); } catch { /* the ticks are lost on reload, which is fine */ }
}
export const doneCount = (state) => GUIDE_STEPS.filter((step) => state.done[step.id]).length;
export const allDone = (state) => doneCount(state) === GUIDE_STEPS.length;

/**
 * Should the card appear when something asks to open it? `force` is the student's own request (the menu item); anything the app does
 * by itself (after the demo loads) must not bring back a card the student closed, or one that has already said goodbye.
 */
export function canOpen(state, { force = false } = {}) {
  if (force) return true;
  return !state.dismissed && !state.finished;
}

/**
 * @param {object} deps
 * @param {HTMLElement} deps.root where the card lives
 * @param {{ask: () => void, talk: () => void, skipTalk: () => void, test: () => void, progress: () => void, sample: () => void, why: () => void, ownNotes: () => void}} deps.actions
 */
export function mountGuide({ root, actions, storage = globalThis.localStorage, setTimer = globalThis.setTimeout }) {
  let state = readGuide(storage);
  const save = () => writeGuide(storage, state);
  let squeezed = false;   // the Study room and phones: the card would cover content, so it shows as its small pill there
  let peek = false;       // the student tapped the pill while squeezed: show the card until they leave
  let goodbye = null;     // the timer that removes the card after "You have seen everything"

  function close() {
    state.open = false;
    state.dismissed = true;   // the x is final: no page change or demo reload opens it again
    save();
    draw();
  }

  function finish() {
    clearTimeout(goodbye);
    state.open = false;
    state.finished = true;
    save();
    draw();
  }

  /** The farewell stays for a few seconds once the student can actually see it (a running call hides the card), then goes for good. */
  function sayGoodbye(tries = 0) {
    clearTimeout(goodbye);
    goodbye = setTimer(() => {
      if (!state.open) return;
      if (root.offsetParent === null && tries < 30) { sayGoodbye(tries + 1); return; }   // hidden for now: wait until it is on screen
      finish();
    }, tries === 0 ? DONE_MESSAGE_MS : 2000);
  }

  function pill(count) {
    return el('button', { class: 'guide-pill', type: 'button', 'aria-expanded': 'false', 'aria-label': `Open the guided demo, ${count} of ${GUIDE_STEPS.length} done`,
      onclick: () => { if (state.min) { state.min = false; save(); } else peek = true; draw(); } },
    el('span', { class: 'mono', text: 'Guided demo' }), el('b', { text: `${count}/${GUIDE_STEPS.length}` }));
  }

  function draw() {
    root.hidden = !state.open;
    if (!state.open) { root.replaceChildren(); return; }
    const count = doneCount(state);
    const all = allDone(state);
    if (!all && (state.min || (squeezed && !peek))) { render(root, pill(count)); return; }
    const next = GUIDE_STEPS.find((step) => !state.done[step.id]);
    const collapse = () => { state.min = true; peek = false; save(); draw(); };
    render(root, el('section', { class: 'guide', 'aria-label': 'Guided demo' },
      el('div', { class: 'guide-head' },
        el('div', {}, el('span', { class: 'mono', text: `Guided demo · ${count} of ${GUIDE_STEPS.length}` }),
          el('b', { text: all ? 'You have seen everything. Thanks for judging!' : 'Try the four things that matter' })),
        el('div', { class: 'guide-tools' },
          all ? null : el('button', { class: 'icon-btn', type: 'button', 'aria-expanded': 'true', 'aria-label': 'Collapse the guide to a small pill', onclick: collapse }, '–'),
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close the guide', onclick: all ? finish : close }, '×'))),
      el('span', { class: 'guide-bar', 'aria-hidden': 'true' }, el('i', { style: `width:${(count / GUIDE_STEPS.length) * 100}%` })),
      all
        ? el('div', { class: 'guide-end' },
          el('p', { text: 'One more idea: upload just a syllabus, even one word per topic, and Eklavya teaches each topic.' }),
          el('div', { class: 'guide-acts' },
            el('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { finish(); actions.sample(); } }, 'Try a sample syllabus'),
            el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => { finish(); actions.ownNotes(); } }, 'Use my own notes')))
        : el('ol', { class: 'guide-steps' }, GUIDE_STEPS.map((step, index) => {
          const done = Boolean(state.done[step.id]);
          return el('li', { class: `guide-step${done ? ' done' : ''}${step === next ? ' cur' : ''}` },
            el('span', { class: 'guide-mk', 'aria-hidden': 'true', text: done ? '✓' : String(index + 1) }),
            el('span', { class: 'guide-copy' }, el('b', { text: step.title }), step === next ? el('small', { text: step.text }) : null,
              step === next && step.id === 'talk' ? el('button', { class: 'linkbtn guide-alt', type: 'button', onclick: actions.skipTalk }, 'No mic here? Skip this step') : null),
            done ? el('span', { class: 'visually-hidden', text: 'done' })
              : el('button', { class: `btn btn-sm ${step === next ? 'btn-primary' : 'btn-secondary'}`, type: 'button', onclick: actions[step.id] }, 'Do it'));
        }))));
  }

  draw();
  return {
    /** Open the guide. `min` opens it as the small pill; `force` is the student's own request (the menu), which also undoes an earlier close. */
    open({ min = false, force = false } = {}) {
      if (!canOpen(state, { force })) return false;
      if (force) { state.dismissed = false; state.finished = false; }
      state.open = true;
      state.min = min;
      save();
      draw();
      return true;
    },
    /** A step really happened: tick it. It is remembered even while the card is closed or not yet shown. */
    mark(id) {
      if (!GUIDE_STEPS.some((step) => step.id === id) || state.done[id]) return;
      state.done[id] = true;
      save();
      if (!state.open) return;
      draw();
      if (allDone(state)) sayGoodbye();
    },
    isOpen: () => state.open,
    /** Called when the screen changes: in the Study room and on a phone the card collapses to its pill (not remembered). */
    setSqueezed(on) {
      squeezed = on; peek = false;
      if (state.open && allDone(state)) { finish(); return; }   // the farewell has been shown: moving on to another screen ends it
      draw();
    },
  };
}
