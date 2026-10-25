// Quiz card: the tutor asks aloud; the student can answer by voice or tap an option (sent to the same Gemini session).
import { el, $ } from './dom.js';

export function showQuestion(q, onPick) {
  const card = $('quizcard');
  card.replaceChildren(
    el('div', { class: 'card-title' }, el('span', { text: 'Quiz' }), el('span', { class: 'pill', text: q.number ? 'Question ' + q.number + ' of ' + q.total + ' · ' + q.topic : q.topic })),
    el('p', { class: 'q-text', text: q.question }),
    el('div', { class: 'opts' }, (q.options || []).map((o) => {
      const letter = o.trim().charAt(0);
      return el('button', {
        class: 'opt', type: 'button',
        onclick: (e) => { onPick(letter); markPicked(e.currentTarget); },
      }, o);
    })),
    el('p', { class: 'hint', text: 'Say your answer out loud, or tap an option.' }),
  );
  card.hidden = false;
}

function markPicked(btn) {
  btn.parentElement.querySelectorAll('.opt').forEach((b) => b.classList.remove('picked'));
  btn.classList.add('picked');
}

export function showResult(ev) {
  const card = $('quizcard');
  if (card.hidden) return;
  card.querySelectorAll('.opt').forEach((b) => { b.disabled = true; });
  const delta = Math.round((ev.after - ev.before) * 10) / 10;
  card.append(el('div', { class: 'result ' + (ev.is_correct ? 'ok' : 'bad') },
    el('strong', { text: ev.is_correct ? 'Correct' : 'Not quite' }),
    el('span', { text: ' ' + ev.topic + ' mastery ' + ev.before + '% → ' + ev.after + '% (' + (delta > 0 ? '+' : '') + delta + ')' }),
    ev.misconception ? el('p', { class: 'mis', text: 'Misconception: ' + ev.misconception.text }) : null,
    ev.misconceptions_resolved ? el('p', { class: 'resolved', text: 'Misconception resolved' }) : null,
  ));
}
