// Three quick questions, asked once after a few answers or flashcards. The answers feed the "What students said" line on Why Eklavya.
import { el, render } from '../lib/dom.js';

const KEY = 'eklavya.feedback';
const NEEDED = 4;   // answers or card ratings before the card appears

const QUESTIONS = [
  { id: 'easier', text: 'Was the explanation easier than your textbook?', options: [['yes', 'Yes'], ['same', 'About the same'], ['no', 'No']] },
  { id: 'trust', text: 'Did the cited passages help you trust the answer?', options: [['yes', 'Yes'], ['no', 'No']] },
  { id: 'rating', text: 'How would you rate Eklavya?', options: [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']] },
];

/** @returns {{count: () => void}} call count() for every answer or card rating; the card shows itself once enough have happened. */
export function mountFeedbackCard({ send, storage = globalThis.localStorage, root = document.body }) {
  const remembered = () => { try { return storage.getItem(KEY); } catch { return null; } };
  const remember = (value) => { try { storage.setItem(KEY, value); } catch { /* the card may come back next visit, which is fine */ } };
  let seen = 0;
  let card = null;

  function open() {
    const answers = {};
    const body = el('div', { class: 'fb-body' });
    const submit = el('button', { class: 'btn btn-primary btn-sm', type: 'button', disabled: true }, 'Send');
    const status = el('p', { class: 'hint', role: 'status' });
    const close = (value) => { remember(value); card.remove(); card = null; };
    function draw() {
      render(body, QUESTIONS.map((q) => el('fieldset', { class: 'fb-q' }, el('legend', { text: q.text }),
        el('div', { class: 'fb-opts' }, q.options.map(([value, label]) => el('button', { type: 'button', class: 'fb-opt', 'aria-pressed': String(answers[q.id] === value),
          onclick: () => { answers[q.id] = value; submit.disabled = QUESTIONS.some((x) => answers[x.id] == null); draw(); } }, label))))));
    }
    submit.addEventListener('click', async () => {
      submit.disabled = true; status.textContent = 'Sending…';
      try { await send(answers); status.textContent = ''; close('done'); thank(); } catch { status.textContent = 'Could not send. Try again in a moment.'; submit.disabled = false; }
    });
    card = el('section', { class: 'fb-card', role: 'dialog', 'aria-label': 'Quick feedback' },
      el('div', { class: 'fb-head' }, el('b', { text: 'Three quick questions' }),
        el('button', { class: 'icon-btn fb-x', type: 'button', 'aria-label': 'Not now', onclick: () => close('later') }, '×')),
      body, el('div', { class: 'fb-foot' }, status, submit));
    draw();
    root.append(card);
  }

  function thank() {
    const note = el('div', { class: 'fb-card fb-thanks', role: 'status' }, 'Thank you. This helps Eklavya get better.');
    root.append(note);
    setTimeout(() => note.remove(), 3500);
  }

  return {
    count() {
      if (remembered() || card) return;
      seen += 1;
      if (seen >= NEEDED) open();
    },
  };
}
