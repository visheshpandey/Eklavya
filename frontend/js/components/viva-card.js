// Viva practice: the examiner's question with an answer timer, the marks so far, and the report card at the end.
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/strings.js';
import { selectLanguage, selectViva } from '../state/selectors.js';

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function mountVivaCard({ store, root }) {
  let timer = null;
  let timedQuestion = null;   // the question the deadline belongs to
  let deadline = 0;           // when its answer time runs out (survives redraws)

  function stopTimer() { clearInterval(timer); timer = null; }

  /** Count down once per second without redrawing the card (the time left is shown, not announced). */
  function runTimer(node, seconds, language) {
    stopTimer();
    const bar = node.querySelector('.viva-timer-bar > span');
    const label = node.querySelector('.viva-timer-text');
    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      bar.style.width = `${(100 * left) / seconds}%`;
      label.textContent = left ? t('viva.timeLeft', language, { s: left }) : t('viva.timeUp', language);
      node.classList.toggle('is-late', left <= 10);
      if (!left) stopTimer();
    };
    tick();
    timer = setInterval(tick, 1000);
  }

  function marksRow(viva, language) {
    if (!viva.marks.length) return null;
    return el('div', { class: 'viva-marks' },
      el('span', { class: 'hint', text: t('viva.marks', language) }),
      el('ol', { class: 'viva-mark-list' }, [...viva.marks].sort((a, b) => a.number - b.number).map((m) =>
        el('li', { class: `viva-mark mark-${m.mark >= 1.5 ? 'good' : m.mark >= 1 ? 'ok' : 'low'}`, title: m.feedback },
          `${m.number}: ${fmt(m.mark)}/${m.out_of}`))),
      el('p', { class: 'viva-feedback', text: viva.marks[viva.marks.length - 1].feedback }));
  }

  function report(r, language) {
    return el('div', { class: 'viva-report', role: 'status' },
      el('h3', { class: 'block-title' }, icon('student', { size: 20 }), t('viva.report', language)),
      el('p', { class: 'viva-score' }, el('strong', { text: fmt(r.marks) }), ` / ${r.out_of}`),
      el('div', { class: 'meter', role: 'img', 'aria-label': `${r.percent}%` }, el('span', { style: `width:${r.percent}%` })),
      r.strengths ? el('p', {}, el('strong', { text: `${t('viva.good', language)}: ` }), r.strengths) : null,
      r.improve ? el('p', {}, el('strong', { text: `${t('viva.improve', language)}: ` }), r.improve) : null,
      el('ol', { class: 'viva-answers' }, r.answers.map((a) => el('li', {},
        el('span', { class: 'viva-q', text: a.question }), el('span', { class: 'hint', text: `${fmt(a.mark)}/2 · ${a.feedback}` })))));
  }

  function draw() {
    const state = store.getState();
    const viva = selectViva(state);
    const language = selectLanguage(state);
    root.hidden = !viva;
    if (!viva) { stopTimer(); timedQuestion = null; replaceContent(root); return; }
    if (viva.report) { stopTimer(); replaceContent(root, report(viva.report, language)); return; }

    const q = viva.question;
    if (q && q !== timedQuestion) { timedQuestion = q; deadline = Date.now() + q.seconds * 1000; }
    const answering = q && !viva.marks.some((m) => m.number === q.number);   // once marked, the clock no longer matters
    const card = el('div', { class: 'viva-question' },
      el('div', { class: 'quiz-head' },
        el('h3', { class: 'quiz-count' }, icon('student', { size: 20 }), q ? t('viva.question', language, { n: q.number, total: q.total }) : t('viva.title', language)),
        q?.topic ? el('span', { class: 'quiz-topic', text: q.topic }) : null),
      q ? el('p', { class: 'q-text', text: q.question }) : null,
      answering ? el('div', { class: 'viva-timer' },
        el('div', { class: 'viva-timer-bar', 'aria-hidden': 'true' }, el('span')),
        el('span', { class: 'viva-timer-text hint' })) : null,
      marksRow(viva, language));
    replaceContent(root, card);
    if (answering) runTimer(card, q.seconds, language); else stopTimer();
  }

  store.select(selectViva, draw);
  store.select(selectLanguage, draw);
}
