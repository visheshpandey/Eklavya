// The first thing a new student or a judge sees on Today: what Eklavya is, in one line, and two ways in. It collapses to the normal greeting
// after first use (remembered), and never shows to someone who has gone through it.
import { el, render } from '../lib/dom.js';
import { icon } from '../lib/icons.js';

const KEY = 'eklavya.welcome.done';
const STEPS = [['upload-simple', 'Upload', 'your notes'], ['microphone', 'Talk', 'in Hinglish'], ['chart-line-up', 'Master', 'watch it grow']];

export function mountWelcome({ root, isGuest, onDemo, onUpload, onTour, storage = globalThis.localStorage }) {
  const seen = () => { try { return storage.getItem(KEY) === '1'; } catch { return false; } };
  function done() {
    try { storage.setItem(KEY, '1'); } catch { /* shown again next visit */ }
    root.hidden = true;
  }
  function draw() {
    if (seen()) { root.hidden = true; return; }
    root.hidden = false;
    render(root, el('section', { class: 'welcome', 'aria-label': 'Welcome to Eklavya' },
      el('div', { class: 'welcome-copy' },
        el('span', { class: 'mono', text: 'A voice-first study mentor' }),
        el('h2', { text: 'Your notes. Your language. A mentor that talks back.' }),
        el('p', { class: 'lead', text: 'Upload notes → talk in Hinglish → get tested → watch mastery grow.' }),
        el('ul', { class: 'hero-chips', 'aria-label': 'What makes Eklavya different' }, ['Speaks Hinglish', 'Cites your own notes', 'Knows what you are forgetting'].map((text) => el('li', { text }))),
        el('div', { class: 'welcome-acts' },
          isGuest ? el('button', { class: 'btn btn-primary btn-lg', type: 'button', id: 'btnTryDemo', onclick: async () => { done(); await onDemo(); } }, 'Try a 30-sec demo') : el('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => { done(); onTour(); } }, 'Take the tour'),
          el('button', { class: 'btn btn-secondary btn-lg', type: 'button', onclick: () => { done(); onUpload(); } }, 'Upload my notes'),
          el('button', { class: 'linkbtn', type: 'button', onclick: done }, 'Skip'))),
      el('ol', { class: 'welcome-steps', 'aria-label': 'How it works' }, STEPS.map(([name, title, sub], i) => el('li', { style: `--i:${i}` },
        el('span', { class: 'ws-icon' }, icon(name, { size: 26 })), el('b', { text: title }), el('small', { class: 'mono', text: sub }))))));
  }
  draw();
  return { done, show() { try { storage.removeItem(KEY); } catch { /* fine */ } draw(); } };
}
