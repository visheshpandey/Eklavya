// Keeps what matters in view in the Study room: a compact mentor card while something is on screen, and a gentle scroll to whatever just appeared.
import { focusTargetFor, isWorking } from '../lib/study-focus.js';

export function mountStudyFocus({ store, panel, reduceMotion = false }) {
  let previous = { question: null, result: null, summary: null, boardIndex: -1, viva: null, verdict: null, debateScore: null };

  function snapshot(state) {
    const { session } = state;
    return { question: session.question, result: session.result, summary: session.summary, boardIndex: session.boardIndex, viva: session.viva,
      verdict: session.verdict, debateScore: session.debateScores.at(-1) ?? null };
  }

  function update(state) {
    const { session, voiceStatus } = state;
    panel.classList.toggle('is-working', isWorking({ active: voiceStatus !== 'idle', question: session.question, boards: session.boards, summary: session.summary,
      viva: session.viva, debateScores: session.debateScores, verdict: session.verdict }));
    const next = snapshot(state);
    const selector = focusTargetFor(previous, next);
    previous = next;
    if (!selector) return;
    // after the card has drawn itself (it may hold the last result for a moment before swapping in the next question)
    setTimeout(() => {
      const target = panel.querySelector(selector) ?? panel.querySelector('#quizcard');
      if (target && !target.hidden) target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    }, 60);
  }

  update(store.getState());
  store.subscribe(update);
}
