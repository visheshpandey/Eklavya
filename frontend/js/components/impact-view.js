// "Why Eklavya": the problem, the solution, what it costs to serve one student (computed on the server from the configured models, with the formula
// shown), Lite mode for slow networks, the languages, and the pilot numbers we do not have yet (left as TODO on purpose: never invented).
import { el, render } from '../lib/dom.js';
import { isLite, setLite } from '../motion/env.js';

const usd = (n) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`;

export function mountImpact({ root, loadImpact }) {
  let data = null, failed = false;

  function cost() {
    if (failed) return el('p', { class: 'hint', text: 'The cost estimate could not be loaded. It is computed from the configured models on the server.' });
    if (!data) return el('div', { class: 'skeleton sk-line', role: 'status', 'aria-label': 'Working out the cost' });
    return el('div', { class: 'cost' },
      el('p', { class: 'cost-total' }, el('strong', { text: `about ${usd(data.total_usd)}` }), ` per student per month (about ₹${data.total_inr} at ₹${data.inr_per_usd} to the dollar)`),
      el('table', { class: 'cost-table' }, el('caption', { class: 'visually-hidden', text: 'How the monthly cost is worked out' }),
        el('thead', {}, el('tr', {}, ['Part', 'Formula', 'Cost'].map((h) => el('th', { scope: 'col', text: h })))),
        el('tbody', {}, data.lines.map((l) => el('tr', {}, el('td', { text: l.label }), el('td', { class: 'mono', text: l.formula }), el('td', { class: 'tnum', text: usd(l.usd) }))))),
      el('p', { class: 'hint', text: `Models in use: ${data.models.text} (text), ${data.models.live} (live voice, voice ${data.models.voice}), ${data.models.embedding} (search). Eklavya's voice comes from the live model itself, so there is no separate text-to-speech bill.` }),
      el('p', { class: 'hint', text: data.verify }));
  }

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
      el('div', { class: 'impact-block' }, el('span', { class: 'mono', text: 'What it costs to serve one student' }), cost()),
      el('div', { class: 'impact-grid' },
        el('div', {}, el('span', { class: 'mono', text: 'Works on slow networks' }),
          el('p', { text: 'Lite mode turns off the 3D scenes and uses the drawn mentor, so the page loads fast and the conversation still works. It switches on by itself on a 2G or 3G connection or when Data Saver is on.' }),
          el('button', { class: 'btn btn-secondary', type: 'button', 'aria-pressed': String(isLite()), onclick: () => { setLite(!isLite()); location.reload(); } }, isLite() ? 'Lite mode: on (turn off)' : 'Lite mode: off (turn on)')),
        el('div', {}, el('span', { class: 'mono', text: 'Languages' }),
          el('p', { text: 'Now: English, Hindi, Hinglish. Next: Marathi, Tamil, Bengali. Adding a language is adding one dictionary of interface text; the tutor already follows the language it is asked to speak. It works for any syllabus because it learns from the notes a student uploads.' }))),
      el('div', { class: 'impact-block' }, el('span', { class: 'mono', text: 'Pilot results' }),
        el('dl', { class: 'todo' },
          el('dt', { text: 'Students in the pilot' }), el('dd', { text: 'TODO: add the real number after the pilot' }),
          el('dt', { text: 'Colleges' }), el('dd', { text: 'TODO: add the real number after the pilot' }),
          el('dt', { text: 'Change in mastery or marks' }), el('dd', { text: 'TODO: measured, not estimated' }))));
  }
  draw();
  loadImpact().then((result) => { data = result; draw(); }).catch(() => { failed = true; draw(); });
  return { redraw: draw };
}
