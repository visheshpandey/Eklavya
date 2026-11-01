// Mock exam: a timed paper across all your topics. Three steps in one dialog: choose length, answer, read the report.
// The block on Progress shows the start button and past scores. The server grades; the timer here only reminds.
import { el, render } from '../lib/dom.js';

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function mountMockExam({ dialog, block, onStart, onSubmit, onHistory, onDone = () => {} }) {
  let stage = 'setup';          // setup | busy | exam | report
  let exam = null;
  let answers = {};
  let index = 0;
  let left = 0;
  let timer = null;
  let message = '';
  let report = null;
  let past = [];

  const stopTimer = () => { clearInterval(timer); timer = null; };

  function close() { stopTimer(); if (dialog.open) dialog.close(); }

  function drawBlock() {
    render(block,
      el('p', { class: 'hint', text: 'A timed paper across all your topics, marked at the end with a score for each topic.' }),
      el('button', { class: 'btn btn-primary', type: 'button', onclick: open }, 'Take a mock exam'),
      past.length ? el('ul', { class: 'list mock-history' }, past.slice(0, 5).map((e) => el('li', { class: 'mock-row' },
        el('strong', { text: `${e.percent}%` }),
        el('span', { class: 'hint', text: `${e.correct} of ${e.total} right` })))) : null);
  }

  async function refresh() {
    try { past = (await onHistory()).exams; } catch { /* keeps the last list */ }
    drawBlock();
  }

  function setupStage() {
    const count = el('select', { id: 'exam-count', class: 'select' }, [5, 10, 15, 20].map((n) => el('option', { value: n, selected: n === 10 ? '' : null }, `${n} questions`)));
    const minutes = el('select', { id: 'exam-minutes', class: 'select' }, [5, 10, 15, 30, 45].map((n) => el('option', { value: n, selected: n === 15 ? '' : null }, `${n} minutes`)));
    const form = el('form', { class: 'auth-form' },
      el('label', { class: 'auth-field', for: 'exam-count' }, el('span', { text: 'Length' }), count),
      el('label', { class: 'auth-field', for: 'exam-minutes' }, el('span', { text: 'Time' }), minutes),
      el('p', { class: 'hint', text: 'Questions come from all your notes, weakest topics first. Leave one blank and it counts as wrong.' }),
      el('p', { class: 'auth-error', role: 'alert', text: message, hidden: message ? null : '' }),
      el('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Start the exam'),
      el('button', { class: 'link-btn', type: 'button', onclick: close }, 'Not now'));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      stage = 'busy'; message = ''; draw();
      try {
        exam = await onStart(Number(count.value), Number(minutes.value));
        answers = {}; index = 0; left = exam.minutes * 60; stage = 'exam';
        timer = setInterval(() => { left -= 1; if (left <= 0) hand(); else tick(); }, 1000);
      } catch (error) { message = error.message; stage = 'setup'; }
      draw();
    });
    return ['Mock exam', form];
  }

  function tick() {
    const node = dialog.querySelector('#exam-clock');
    if (node) { node.textContent = clock(left); node.classList.toggle('is-low', left <= 60); }
  }

  async function hand() {
    stopTimer();
    stage = 'busy'; draw();
    try { report = await onSubmit(exam.exam_id, answers); stage = 'report'; onDone(); refresh(); }
    catch (error) { message = error.message; stage = 'exam'; timer = setInterval(() => { left -= 1; if (left <= 0) hand(); else tick(); }, 1000); }
    draw();
  }

  function examStage() {
    const q = exam.questions[index];
    const answered = Object.keys(answers).length;
    const options = q.options.map((text) => {
      const letter = text.trim()[0];
      return el('button', { class: `choice${answers[q.position] === letter ? ' is-picked' : ''}`, type: 'button', 'aria-pressed': String(answers[q.position] === letter),
        onclick: () => { answers[q.position] = letter; draw(); } }, text);
    });
    return [`Question ${index + 1} of ${exam.total}`, el('div', { class: 'exam-body' },
      el('p', { class: 'exam-clock-row' }, el('span', { class: 'meta-chip', text: q.topic }),
        el('span', { id: 'exam-clock', class: `exam-clock${left <= 60 ? ' is-low' : ''}`, role: 'timer', text: clock(left) })),
      el('p', { class: 'exam-q', text: q.question }),
      el('div', { class: 'choices' }, options),
      el('p', { class: 'auth-error', role: 'alert', text: message, hidden: message ? null : '' }),
      el('div', { class: 'exam-nav' },
        el('button', { class: 'btn btn-secondary', type: 'button', disabled: index === 0 ? '' : null, onclick: () => { index -= 1; draw(); } }, 'Back'),
        index < exam.total - 1
          ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { index += 1; draw(); } }, 'Next')
          : el('button', { class: 'btn btn-primary', type: 'button', onclick: hand }, `Hand in (${answered} of ${exam.total} answered)`)))];
  }

  function reportStage() {
    const r = report;
    return ['Your score', el('div', { class: 'exam-body' },
      el('p', { class: 'exam-score', text: `${r.percent}%` }),
      el('p', { class: 'hint', text: `${r.correct} of ${r.total} right, ${r.answered} answered${r.seconds ? `, ${clock(r.seconds)} used` : ''}` }),
      r.weak_topics.length ? el('p', { text: `Work on next: ${r.weak_topics.join(', ')}.` }) : el('p', { text: 'Every topic is looking solid.' }),
      el('ul', { class: 'list' }, r.topics.map((t) => el('li', { class: 'exam-topic' },
        el('span', { text: t.topic }), el('strong', { text: `${t.correct}/${t.total}` })))),
      el('details', { class: 'doubt' }, el('summary', {}, 'Review every question'),
        r.review.map((item) => el('div', { class: `exam-review ${item.is_correct ? 'is-right' : 'is-wrong'}` },
          el('p', { class: 'exam-q', text: `${item.position}. ${item.question}` }),
          el('p', { class: 'hint', text: item.answer ? `You chose ${item.answer}. Correct: ${item.correct}.` : `Not answered. Correct: ${item.correct}.` }),
          item.explanation ? el('p', { class: 'hint', text: item.explanation }) : null))),
      el('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: close }, 'Done'))];
  }

  function draw() {
    if (stage === 'busy') {
      render(dialog, el('div', { class: 'auth-card' }, el('h2', { id: 'exam-title', text: 'One moment…' }),
        el('p', { class: 'hint', role: 'status', text: exam ? 'Marking your paper.' : 'Getting your questions ready. This can take a little while.' })));
      return;
    }
    const [title, body] = stage === 'setup' ? setupStage() : stage === 'exam' ? examStage() : reportStage();
    render(dialog, el('div', { class: 'auth-card exam-card' }, el('h2', { id: 'exam-title', text: title }), body));
  }

  function open() {
    stage = 'setup'; exam = null; report = null; message = '';
    draw();
    if (!dialog.open) dialog.showModal();
  }

  dialog.addEventListener('cancel', (event) => { if (stage === 'exam' || stage === 'busy') event.preventDefault(); });   // Escape must not throw the paper away
  dialog.addEventListener('close', stopTimer);
  drawBlock();
  refresh();
  return { open, refresh };
}
