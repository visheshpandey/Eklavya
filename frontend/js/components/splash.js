// The loading screen for a sleeping server: a calm, branded full page (not a pop-up over a half-empty app). The page never shows broken or empty
// screens meanwhile: this covers it until the server answers, then fades away and the real app is already loaded behind it.
// It only appears if the wait is noticeable (the CSS delays it by 0.6 s), so a server that is already awake never shows it.
import { warmup } from '../lib/warmup.js';

const LINES = [
  'Every answer cites the passage of your notes it came from.',
  'Talk in English, Hindi or Hinglish. Interrupt any time.',
  'A whiteboard draws the idea while the mentor explains.',
  'Spaced repetition brings each flashcard back at the right time.',
  'Mastery rises with every right answer and fades if a topic is left alone.',
];

export function mountSplash({ root }) {
  if (warmup.state() === 'ready') { root.remove(); return; }
  const seconds = root.querySelector('[data-splash-seconds]');
  const line = root.querySelector('[data-splash-line]');
  const tick = setInterval(() => {
    const elapsed = warmup.elapsed();
    if (seconds) seconds.textContent = `${Math.round(elapsed / 1000)} s`;
    if (line) line.textContent = LINES[Math.floor(elapsed / 5000) % LINES.length];
  }, 1000);
  warmup.onChange(() => {
    clearInterval(tick);
    root.classList.add('splash-out');
    setTimeout(() => root.remove(), 600);
  });
}
