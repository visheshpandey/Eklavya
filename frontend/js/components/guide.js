// The guided demo: four things a first-time visitor (a judge) does, not just looks at. Each row has a "Do it" button that takes them
// to the real feature; rows tick themselves when the thing really happened (an answer came back, a voice session started, a card was
// rated, the progress map was opened). Progress is kept in localStorage, so a reload keeps the ticks.
import { el, render } from '../lib/dom.js';

const KEY = 'eklavya.guide';

export const GUIDE_STEPS = [
  { id: 'ask', title: 'Ask your notes', text: 'See an answer with the exact passage it came from.' },
  { id: 'talk', title: 'Talk to your mentor', text: 'Allow the mic, then just speak. Interrupt any time.' },
  { id: 'cards', title: 'Test yourself', text: 'Flip a card, rate it, and watch mastery move.' },
  { id: 'progress', title: 'See your progress', text: 'Every topic as a sphere: green strong, gold growing, terracotta weak.' },
];

/** The saved state: {open, min, done: {stepId: true}}. Pure, so it can be tested. */
export function readGuide(storage) {
  try {
    const saved = JSON.parse(storage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') return { open: Boolean(saved.open), min: Boolean(saved.min), done: { ...(saved.done || {}) } };
  } catch { /* fresh state */ }
  return { open: false, min: false, done: {} };
}
export function writeGuide(storage, state) {
  try { storage.setItem(KEY, JSON.stringify(state)); } catch { /* the ticks are lost on reload, which is fine */ }
}
export const doneCount = (state) => GUIDE_STEPS.filter((step) => state.done[step.id]).length;

/**
 * @param {object} deps
 * @param {HTMLElement} deps.root where the card lives
 * @param {{ask: () => void, talk: () => void, skipTalk: () => void, cards: () => void, progress: () => void, sample: () => void, why: () => void, ownNotes: () => void}} deps.actions
 */
export function mountGuide({ root, actions, storage = globalThis.localStorage }) {
  let state = readGuide(storage);
  const save = () => writeGuide(storage, state);

  function draw() {
    root.hidden = !state.open;
    if (!state.open) { root.replaceChildren(); return; }
    const count = doneCount(state);
    const all = count === GUIDE_STEPS.length;
    if (state.min) {
      render(root, el('button', { class: 'guide-pill', type: 'button', 'aria-label': `Open the guided demo, ${count} of ${GUIDE_STEPS.length} done`,
        onclick: () => { state.min = false; save(); draw(); } }, el('span', { class: 'mono', text: 'Guided demo' }), el('b', { text: `${count}/${GUIDE_STEPS.length}` })));
      return;
    }
    const next = GUIDE_STEPS.find((step) => !state.done[step.id]);
    render(root, el('section', { class: 'guide', 'aria-label': 'Guided demo' },
      el('div', { class: 'guide-head' },
        el('div', {}, el('span', { class: 'mono', text: `Guided demo · ${count} of ${GUIDE_STEPS.length}` }),
          el('b', { text: all ? 'That’s Eklavya.' : 'Try the four things that matter' })),
        el('div', { class: 'guide-tools' },
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Make the guide smaller', onclick: () => { state.min = true; save(); draw(); } }, '–'),
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close the guide', onclick: () => { state.open = false; save(); draw(); } }, '×'))),
      el('span', { class: 'guide-bar', 'aria-hidden': 'true' }, el('i', { style: `width:${(count / GUIDE_STEPS.length) * 100}%` })),
      all
        ? el('div', { class: 'guide-end' },
          el('p', { text: 'Now try the part students need most: upload just a syllabus, even one word per topic, and Eklavya teaches each topic.' }),
          el('div', { class: 'guide-acts' },
            el('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: actions.sample }, 'Try a sample syllabus'),
            el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: actions.why }, 'Why it matters'),
            el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: actions.ownNotes }, 'Use my own notes')))
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
    /** Open the guide (from the welcome or the menu). */
    open() { state.open = true; state.min = false; save(); draw(); },
    /** A step really happened: tick it (only while the guide is in use). */
    mark(id) {
      if (!state.open || state.done[id]) return;
      state.done[id] = true;
      save();
      draw();
    },
    isOpen: () => state.open,
  };
}
