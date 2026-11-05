// Text mode: the same lesson and test, by typing and tapping, using the ordinary (non-Live) endpoints. It takes over when the voice would not
// connect, stalled, or has no microphone, so a student (or a judge with no mic) can always finish a test: Q1, Q2, Q3, then the summary.
// It speaks the live server's own event language through `emit`, so the question card, the stepper, the summary and the toasts work unchanged.
import { createAutoAdvance } from '../lib/auto-advance.js';
import { cancel as defaultCancel, schedule as defaultSchedule } from '../lib/timers.js';

export const QUESTIONS_PER_MODE = { learn: 3, test: 3, revise: 2 };
const ANSWER_LETTER = /^\s*(?:option\s*|answer\s*|ans\s*)?\(?([A-D])\)?[\s.!)]*$/i;

/** A typed or spoken answer that is just an option letter ("B", "option c", "(d)"): the letter, else null. Pure. */
export const letterFrom = (text) => ANSWER_LETTER.exec(String(text ?? ''))?.[1].toUpperCase() ?? null;

/** What the student tapped or typed, turned into the server's own `mastery` event. Pure. */
export function masteryEvent(res, questionId) {
  return { type: 'mastery', topic: res.topic, before: res.mastery_before, after: res.mastery_after, is_correct: res.is_correct,
    misconception: res.misconception ?? null, misconceptions_resolved: res.misconceptions_resolved, chosen: res.chosen,
    correct_answer: res.correct_answer, question_id: questionId, retry: false };
}

/** The end-of-test summary, from the graded results. Pure. */
export function summaryEvent(results, topic) {
  return { type: 'test_summary', topic, correct: results.filter((r) => r.is_correct).length, total: results.length,
    mastery_before: results[0].before, mastery_after: results[results.length - 1].after,
    misconceptions: results.map((r) => r.misconception).filter(Boolean), resolved: results.reduce((n, r) => n + (r.resolved || 0), 0) };
}

/**
 * @param {object} deps
 * @param {*} deps.store
 * @param {{ask: Function, quizGenerate: Function, quizSubmit: Function}} deps.backend
 * @param {(event: object) => void} deps.emit handles a server-style event (the session controller's handleEvent)
 * @param {{error: Function}} deps.notifier
 * @param {() => string} deps.getLanguage
 */
export function createTextSession({ store, backend, emit, notifier, getLanguage, delayMs = 3000, schedule = defaultSchedule, cancel = defaultCancel }) {
  let mode = null;
  let topicId = null;
  let topic = '';
  let total = 3;
  let asked = [];
  let results = [];
  let queue = null;
  let busy = false;
  let finished = false;
  const advance = createAutoAdvance({ advance: () => next(), delayMs, schedule, cancel });

  const say = (text) => emit({ type: 'transcript', role: 'tutor', text, final: true });
  const youSaid = (text) => emit({ type: 'transcript', role: 'user', text, final: true });
  const current = () => store.getState().session;
  const waitingForAnswer = () => { const s = current(); return Boolean(s.question && s.result?.question_id !== s.question.question_id); };

  async function explain() {
    const prompt = mode === 'revise'
      ? `Give me a quick recap of "${topic}" in about five short lines.`
      : `Teach me "${topic}" step by step in simple words, with one everyday example.`;
    emit({ type: 'phase', phase: mode === 'revise' ? 'revise' : 'teaching', topic });
    try { say((await backend.ask(prompt, getLanguage())).answer); } catch (err) { notifier.error(err); say('I could not reach my notes just now. Let us go straight to the questions.'); }
  }

  async function next() {
    if (busy || finished) return;
    advance.disarm();
    if (results.length >= total) { finish(); return; }
    busy = true;
    try {
      if (!queue || !queue.length) {
        const wanted = asked.length + (total - results.length);
        const data = await backend.quizGenerate(topicId, wanted);
        queue = (data.questions ?? []).filter((q) => !asked.includes(q.question_id));
      }
      const question = queue.shift();
      if (!question) { say('There are no more questions on this topic.'); finish(); return; }
      asked.push(question.question_id);
      if (asked.length === 1) emit({ type: 'phase', phase: 'test', topic: question.topic });
      emit({ type: 'quiz_question', ...question, number: asked.length, total });
      say(`Question ${asked.length} of ${total}. Tap an option, or type A, B, C or D.`);
    } catch (err) {
      notifier.error(err);
      say('I could not load the next question. Tap "Next question" to try again.');
    } finally { busy = false; }
  }

  function finish() {
    if (finished || !results.length) return;
    finished = true;
    advance.disarm();
    emit({ type: 'phase', phase: 'summary', topic });
    emit(summaryEvent(results, topic));
    say(`That was the last question: ${results.filter((r) => r.is_correct).length} of ${results.length} right.`);
  }

  async function answer(letter) {
    const question = current().question;
    if (!question || busy || !waitingForAnswer()) return;
    busy = true;
    try {
      const res = await backend.quizSubmit(question.question_id, letter);
      if (res.unclear) { say('Please choose A, B, C or D.'); return; }
      emit(masteryEvent(res, question.question_id));
      results.push({ question_id: question.question_id, is_correct: res.is_correct, before: res.mastery_before, after: res.mastery_after,
        misconception: res.misconception?.text ?? null, resolved: res.misconceptions_resolved ? 1 : 0 });
      say(`${res.is_correct ? 'Correct.' : `Not quite. The answer is ${res.correct_answer}.`} ${res.explanation ?? ''}`.trim());
    } catch (err) {
      notifier.error(err);
      return;
    } finally { busy = false; }
    if (results.length >= total) finish(); else advance.arm();
  }

  return {
    /**
     * Take over a session. `carry` holds what the live call already did: {asked: [question ids shown], results: [graded results]}.
     * A question already on screen and unanswered is kept; otherwise the next step starts at once.
     */
    async begin({ mode: nextMode, topicId: nextTopicId, topic: name = '', carry = {} }) {
      mode = nextMode; topicId = nextTopicId; topic = name;
      total = QUESTIONS_PER_MODE[mode] ?? 3;
      asked = [...(carry.asked ?? [])]; results = [...(carry.results ?? [])];
      queue = null; busy = false; finished = false;
      advance.disarm();
      if (topicId == null || !QUESTIONS_PER_MODE[mode]) {
        say(topicId != null && mode !== 'free'
          ? 'Viva and debate need your voice. Pick Learn, Test or Revise to carry on by typing.'
          : 'Type your question and I will answer from your notes.');
        return;
      }
      if (waitingForAnswer()) return;                     // the question on screen is still open: just wait for the answer
      if (mode !== 'test' && !asked.length) await explain();
      await next();
    },

    /** The student tapped an option. */
    answer,

    /** "Next question →" (or the 3 s timer). */
    next,

    /** Something typed in text mode: an option letter answers the open question; anything else is a question for the notes. */
    async chat(text) {
      youSaid(text);
      const letter = waitingForAnswer() ? letterFrom(text) : null;
      if (letter) { await answer(letter); return; }
      if (/^\s*next( question)?\s*[.!]?\s*$/i.test(text) && current().result) { await next(); return; }
      try { say((await backend.ask(text, getLanguage())).answer); } catch (err) { say(err?.message || 'I could not answer that just now. Please try again.'); }
    },

    stop() { advance.disarm(); finished = true; busy = false; },
    get active() { return mode !== null && !finished; },
  };
}
