// "Why Eklavya": the problem, what it does, how it works (with a diagram), the road ahead, and Lite mode.
import { el, render } from '../lib/dom.js';
import { isLite, setLite } from '../motion/env.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (name, attrs = {}, ...kids) => { const node = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); node.append(...kids); return node; };

/** Browser -> API -> (Gemini, notes search, mastery) -> database, drawn with the page's own colours. */
export function diagram() {
  const box = (x, y, w, label, sub, fill) => svg('g', {},
    svg('rect', { x, y, width: w, height: 54, rx: 10, fill, stroke: 'var(--line)' }),
    svg('text', { x: x + w / 2, y: y + 24, 'text-anchor': 'middle', 'font-size': 14, fill: 'var(--ink)', style: 'font-family:var(--font-serif)' }, label),
    svg('text', { x: x + w / 2, y: y + 42, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--ink-3)', style: 'font-family:var(--font-mono)' }, sub));
  const arrow = (x1, y1, x2, y2) => svg('path', { d: `M${x1} ${y1}L${x2} ${y2}`, stroke: 'var(--ink-3)', 'stroke-width': 1.4, fill: 'none', 'marker-end': 'url(#arr)' });
  return svg('svg', { viewBox: '0 0 640 230', class: 'arch', role: 'img', 'aria-label': 'Architecture: the browser talks to a FastAPI server, which uses Gemini, a search over the notes and a mastery engine, and stores everything in Postgres.' },
    svg('defs', {}, svg('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svg('path', { d: 'M0 0L10 5L0 10z', fill: 'var(--ink-3)' }))),
    box(10, 88, 130, 'Your browser', 'voice, notes, 3D', 'var(--paper-hi)'),
    box(200, 88, 130, 'FastAPI server', 'one API, tested', 'var(--sage)'),
    box(400, 8, 230, 'Gemini', 'voice, answers, reads photos', 'var(--paper-hi)'),
    box(400, 88, 230, 'Search over your notes', 'cites the passage', 'var(--paper-hi)'),
    box(400, 168, 230, 'Mastery engine', 'forgetting curve, revision', 'var(--paper-hi)'),
    arrow(140, 115, 198, 115), arrow(330, 105, 398, 40), arrow(330, 115, 398, 115), arrow(330, 125, 398, 195));
}

export function mountImpact({ root, loadSummary = null }) {
  function draw() {
    render(root,
      el('div', { class: 'impact-grid' },
        el('div', {}, el('span', { class: 'mono', text: 'The problem' }),
          el('p', { text: 'Indian college students study from scattered PDFs and YouTube lectures, mostly in English, while many think and talk in Hindi or Hinglish. A private tutor costs more than most can pay, and most AI tutors answer from the internet, not from the student’s own syllabus.' })),
        el('div', {}, el('span', { class: 'mono', text: 'What Eklavya does' }),
          el('ul', { class: 'md-list' },
            el('li', { text: 'Grounded in your notes: every answer cites the exact passage it came from.' }),
            el('li', { text: 'Voice in English, Hindi and Hinglish: talk, interrupt, and be tested by voice.' }),
            el('li', { text: 'It adapts: spaced repetition and a forgetting curve decide what to revise next.' })))),
      el('div', { class: 'impact-how' }, el('span', { class: 'mono', text: 'How it works' }), diagram(),
        el('ul', { class: 'md-list' },
          el('li', { text: 'Answers use at most the 3 passages of your notes that match best, and say which.' }),
          el('li', { text: 'Mastery fades with time, so topics you have not touched come back before the exam.' }),
          el('li', { text: 'Backed by more than 370 automated tests on the server and the page, and a Lite mode for 2G or 3G.' }))),
      el('div', { class: 'impact-grid' },
        el('div', {}, el('span', { class: 'mono', text: 'Works on slow networks' }),
          el('p', { text: 'Lite mode turns off the 3D scenes and uses the drawn mentor, so the page loads fast and the conversation still works. It switches on by itself on a 2G or 3G connection or when Data Saver is on.' }),
          el('button', { class: 'btn btn-secondary', type: 'button', 'aria-pressed': String(isLite()), onclick: () => { setLite(!isLite()); location.reload(); } }, isLite() ? 'Lite mode: on (turn off)' : 'Lite mode: off (turn on)')),
        el('div', {}, el('span', { class: 'mono', text: 'The road ahead' }),
          el('ul', { class: 'md-list' },
            el('li', { text: 'Now: English, Hindi and Hinglish, for any syllabus a student uploads.' }),
            el('li', { text: 'Next: Marathi, Tamil and Bengali (a language is one dictionary of interface text), an installable app that works offline, and the Play Store.' }),
            el('li', { text: 'Then: study groups for a whole college batch, starting with a small pilot.' })))),
      el('div', { class: 'impact-how' }, el('span', { class: 'mono', text: 'What it costs' }),
        el('p', { text: 'Voice is the main cost: Gemini Live charges about $0.005 a minute for the student’s audio and $0.018 a minute for the mentor’s. A student who talks for 20 minutes, 3 times a week, is about $5.50 a month. Each student has a daily limit of 20 voice minutes, which keeps even daily use under about $14 a month. A written answer costs a fraction of a cent, so Ask and flashcards add almost nothing.' }),
        el('p', { class: 'hint', text: 'Google’s published Gemini API prices, checked 3 November 2026. Gemini also has a free tier.' })),
      el('div', { id: 'impactProof' }));
  }
  async function proof() {
    if (!loadSummary) return;
    try {
      const s = await loadSummary();
      const box = root.querySelector('#impactProof');
      if (!box || s.easier_yes == null) return;   // too few answers: show nothing rather than a weak number
      render(box, el('span', { class: 'mono', text: `What ${s.responses} students said` }),
        el('p', { text: `${s.easier_yes} of ${s.responses} found the explanations easier than their textbook, ${s.trust_yes} of ${s.responses} said the cited passages helped them trust the answer, and they rated Eklavya ${s.average_rating} out of 5.` }));
    } catch { /* the line simply stays out */ }
  }
  draw();
  proof();
  return { redraw: () => { draw(); proof(); } };
}
