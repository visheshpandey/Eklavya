// "Why Eklavya": the problem, the solution, Lite mode for slow networks and the languages.
import { el, render } from '../lib/dom.js';
import { isLite, setLite } from '../motion/env.js';

export function mountImpact({ root }) {
  function draw() {
    render(root,
      el('div', { class: 'impact-grid' },
        el('div', {}, el('span', { class: 'mono', text: 'The problem' }),
          el('p', { text: 'Indian college students study from scattered PDFs and YouTube lectures, mostly in English, while many of them think and talk in Hindi or Hinglish. Most AI tutors answer from the internet, not from the student\'s own syllabus.' })),
        el('div', {}, el('span', { class: 'mono', text: 'What Eklavya does' }),
          el('ul', { class: 'md-list' },
            el('li', { text: 'Grounded in your notes: every answer cites the exact passage it came from.' }),
            el('li', { text: 'Voice in English, Hindi and Hinglish: talk, interrupt, and be tested by voice.' }),
            el('li', { text: 'It adapts: spaced repetition and mastery tracking decide what to revise next.' })))),
      el('div', { class: 'impact-grid' },
        el('div', {}, el('span', { class: 'mono', text: 'Works on slow networks' }),
          el('p', { text: 'Lite mode turns off the 3D scenes and uses the drawn mentor, so the page loads fast and the conversation still works. It switches on by itself on a 2G or 3G connection or when Data Saver is on.' }),
          el('button', { class: 'btn btn-secondary', type: 'button', 'aria-pressed': String(isLite()), onclick: () => { setLite(!isLite()); location.reload(); } }, isLite() ? 'Lite mode: on (turn off)' : 'Lite mode: off (turn on)')),
        el('div', {}, el('span', { class: 'mono', text: 'Languages' }),
          el('p', { text: 'Now: English, Hindi, Hinglish. Next: Marathi, Tamil, Bengali. Adding a language is adding one dictionary of interface text; the tutor already follows the language it is asked to speak. It works for any syllabus because it learns from the notes a student uploads.' }))));
  }
  draw();
  return { redraw: draw };
}
