// A card that covers the server's wake-up: it appears only if the wait is noticeable (over 1.5 s), says what is happening, shows a progress
// bar for the usual 30 to 40 seconds and rotates a few lines about what Eklavya does, then fades out the moment the server answers.
import { el } from '../lib/dom.js';
import { warmup } from '../lib/warmup.js';

const LINES = [
  'Your notes stay yours: every answer cites the passage it came from.',
  'Talk in English, Hindi or Hinglish. You can interrupt any time.',
  'While it explains, a whiteboard draws the idea.',
  'Spaced repetition decides which flashcards come back, and when.',
  'Mastery goes up with every right answer and fades if you leave a topic alone.',
];

export function mountWakeBanner({ root }) {
  if (warmup.state() === 'ready') return;
  let tick = null;
  const text = el('p', { class: 'wake-line', text: LINES[0] });
  const seconds = el('span', { class: 'mono tnum', text: '0 s' });
  const card = el('div', { class: 'wake-card', role: 'status', 'aria-live': 'polite' },
    el('div', { class: 'wake-head' }, el('b', { text: 'Waking up your study mentor' }), seconds),
    el('p', { class: 'hint', text: 'The free server sleeps when nobody is using it. It starts in about 30 seconds the first time. Have a look around meanwhile.' }),
    el('span', { class: 'wake-bar' }, el('i')), text);
  const show = setTimeout(() => {
    if (warmup.state() === 'ready') return;
    root.append(card); root.hidden = false;
    tick = setInterval(() => {
      seconds.textContent = `${Math.round(warmup.elapsed() / 1000)} s`;
      text.textContent = LINES[Math.floor(warmup.elapsed() / 5000) % LINES.length];
    }, 1000);
  }, 1500);
  warmup.onChange(() => {
    clearTimeout(show); clearInterval(tick);
    card.classList.add('wake-out');
    setTimeout(() => { card.remove(); root.hidden = true; }, 500);
  });
}
