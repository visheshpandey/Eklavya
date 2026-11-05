// The Study room never looks frozen: a slow or silent voice call falls back to text mode, the reply bubble is filled from the notes, and a
// test advances Q1 -> Q2 -> Q3 -> Summary even when Live audio fails. Timers are faked, so nothing here waits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/state/store.js';
import { initialState, reducer } from '../js/state/reducer.js';
import { createNotifier } from '../js/controllers/notifier.js';
import { createSessionController } from '../js/controllers/session-controller.js';
import { letterFrom, masteryEvent, summaryEvent } from '../js/controllers/text-session.js';
import { createReplyWatchdog } from '../js/lib/reply-watchdog.js';
import { createAutoAdvance } from '../js/lib/auto-advance.js';

function fakeClock() {
  let now = 0, id = 0;
  const tasks = [];
  return {
    now: () => now,
    schedule: (fn, ms) => { tasks.push({ id: ++id, at: now + ms, fn }); return id; },
    cancel: (taskId) => { const i = tasks.findIndex((x) => x.id === taskId); if (i >= 0) tasks.splice(i, 1); },
    tick(ms) {
      const end = now + ms;
      for (;;) {
        tasks.sort((a, b) => a.at - b.at);
        const next = tasks[0];
        if (!next || next.at > end) break;
        tasks.shift(); now = next.at; next.fn();
      }
      now = end;
    },
    pending: () => tasks.length,
  };
}
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((resolve) => setImmediate(resolve)); };

// ---------- the small pure pieces
test('reply watchdog: fires 20 s after the student finishes if nothing at all came back', () => {
  const clock = fakeClock(), fired = [];
  const dog = createReplyWatchdog({ ...clock, onTimeout: (said) => fired.push(said) });
  dog.userSpoke('what is recall');
  clock.tick(19999); assert.deepEqual(fired, []);
  clock.tick(2); assert.deepEqual(fired, ['what is recall']);
  clock.tick(60000); assert.equal(fired.length, 1);                         // once
});

test('reply watchdog: 8 s after the turn ends with no words, and never when words arrived', () => {
  const clock = fakeClock(), fired = [];
  const dog = createReplyWatchdog({ ...clock, onTimeout: (said) => fired.push(said) });
  dog.userSpoke('hello'); clock.tick(5000); dog.turnComplete();
  clock.tick(7999); assert.deepEqual(fired, []);
  clock.tick(2); assert.deepEqual(fired, ['hello']);
  dog.userSpoke('again'); dog.turnComplete(); dog.replied(); clock.tick(60000);
  assert.deepEqual(fired, ['hello']);                                       // words came: nothing to fill
  dog.turnComplete(); clock.tick(60000); assert.equal(fired.length, 1);     // a turn nobody was waiting for does nothing
  dog.userSpoke('x'); dog.reset(); clock.tick(60000); assert.equal(fired.length, 1);
});

test('auto-advance: 3 s after the result, waits while Eklavya speaks, never later than the cap, and can be cancelled', () => {
  const clock = fakeClock(); let speaking = false, advanced = 0;
  const auto = createAutoAdvance({ ...clock, canAdvance: () => !speaking, advance: () => { advanced++; } });
  auto.arm(); clock.tick(2999); assert.equal(advanced, 0);
  clock.tick(2); assert.equal(advanced, 1);
  speaking = true; auto.arm(); clock.tick(10000); assert.equal(advanced, 1);   // still talking
  speaking = false; clock.tick(1500); assert.equal(advanced, 2);               // done talking: goes on
  speaking = true; auto.arm(); clock.tick(25000); assert.equal(advanced, 3);   // cap: never waits for ever
  auto.arm(); auto.disarm(); clock.tick(60000); assert.equal(advanced, 3);
  assert.equal(clock.pending(), 0);
});

test('option letters typed or spoken are recognised; ordinary sentences are not', () => {
  for (const [text, letter] of [['B', 'B'], ['b', 'B'], ['option c', 'C'], ['Answer D', 'D'], ['(a)', 'A'], [' c. ', 'C']]) assert.equal(letterFrom(text), letter, text);
  for (const text of ['', 'bad', 'what is recall', 'the answer is b because', 'E', null]) assert.equal(letterFrom(text), null, String(text));
});

test('a REST grade becomes the same mastery event the live server sends, and the summary is built from the results', () => {
  const event = masteryEvent({ topic: 'Precision', mastery_before: 38, mastery_after: 47.3, is_correct: true, chosen: 'A', correct_answer: 'A', misconception: null, misconceptions_resolved: false }, 11);
  assert.deepEqual(event, { type: 'mastery', topic: 'Precision', before: 38, after: 47.3, is_correct: true, misconception: null, misconceptions_resolved: false, chosen: 'A', correct_answer: 'A', question_id: 11, retry: false });
  const summary = summaryEvent([{ is_correct: true, before: 38, after: 44, misconception: null, resolved: 0 }, { is_correct: false, before: 44, after: 41, misconception: 'mixed up', resolved: 0 },
    { is_correct: true, before: 41, after: 47, misconception: null, resolved: 1 }], 'Precision');
  assert.deepEqual(summary, { type: 'test_summary', topic: 'Precision', correct: 2, total: 3, mastery_before: 38, mastery_after: 47, misconceptions: ['mixed up'], resolved: 1 });
});

// ---------- the controller, with a fake voice and a fake backend
function setup({ withBackend = true, askFails = false } = {}) {
  const clock = fakeClock();
  const store = createStore(reducer, initialState);
  const notifier = createNotifier(store, { schedule: () => {} });
  const calls = { ask: [], generate: [], submit: [] };
  const questions = [11, 12, 13].map((id) => ({ question_id: id, topic_id: 5, topic: 'Precision', question: `Q${id - 10}?`, options: ['A. x', 'B. y', 'C. z', 'D. w'], difficulty: 'Medium' }));
  const backend = {
    ask: async (question) => { calls.ask.push(question); if (askFails) throw new Error('No notes uploaded yet.'); return { answer: `From your notes: ${question}` }; },
    quizGenerate: async (topicId, count) => { calls.generate.push([topicId, count]); return { questions: questions.slice(0, count) }; },
    quizSubmit: async (questionId, letter) => { calls.submit.push([questionId, letter]);
      return { is_correct: letter === 'A', chosen: letter, correct_answer: 'A', explanation: 'Because.', topic: 'Precision', mastery_before: 38, mastery_after: letter === 'A' ? 47.3 : 35, misconception: null, misconceptions_resolved: false }; },
  };
  const notes = { refresh: () => {}, openTopic: () => {} };
  const session = createSessionController({ store, notes, notifier, userId: 1, getLanguage: () => 'english', backend: withBackend ? backend : null, ...clock });
  const voice = { status: 'idle', started: [], stopped: 0, sent: [], failWith: null,
    async start(opts) { if (this.failWith) throw this.failWith; this.started.push(opts); this.status = 'listening'; session.handleStatus('listening'); },
    stop() { this.stopped++; this.status = 'idle'; session.handleStatus('idle'); },
    sendText(text) { this.sent.push(text); return true; } };
  session.attach(voice);
  const idle = [];
  store.select((s) => s.voiceStatus, (status) => idle.push(status));
  const state = () => store.getState();
  const texts = () => state().session.messages.map((m) => m.text);
  const ask = (n, total = 3) => session.handleEvent({ type: 'quiz_question', question_id: 10 + n, question: `Q${n}?`, options: ['A. x', 'B. y', 'C. z', 'D. w'], topic: 'Precision', number: n, total });
  const grade = (n, correct = true) => session.handleEvent({ type: 'mastery', topic: 'Precision', before: 38, after: 47.3, is_correct: correct, misconception: null, chosen: 'A', correct_answer: 'A', question_id: 10 + n, retry: false });
  return { clock, store, session, voice, calls, state, texts, statuses: idle, ask, grade };
}

test('a call that is not ready in 10 s switches to text mode and carries on with the same test', async () => {
  const { clock, session, voice, state, statuses, calls } = setup();
  await session.start('test', 5);
  assert.equal(state().session.live.ready, false);
  clock.tick(9999); await flush();
  assert.equal(state().session.live.text, false);                            // still waiting
  clock.tick(2); await flush();
  assert.equal(state().session.live.text, true);
  assert.equal(voice.stopped, 1);                                            // the socket and the microphone are released
  assert.equal(state().voiceStatus, 'listening');                            // the room stays open, so the student can type
  assert.ok(!statuses.slice(1).includes('idle'));                            // and it never blinks to "ended" (that would tick off the route)
  assert.equal(state().session.question.question_id, 11);                    // Question 1 is on screen
  assert.deepEqual(state().session.question && [state().session.question.number, state().session.question.total], [1, 3]);
  assert.deepEqual(calls.generate, [[5, 3]]);
  assert.ok(state().toasts.some((x) => /switching to text mode/.test(x.text)));
});

test('the server saying the Gemini link is up cancels the 10 s switch', async () => {
  const { clock, session, voice, state } = setup();
  await session.start('test', 5);
  clock.tick(4000);
  session.handleEvent({ type: 'session', id: 'abc' });
  assert.equal(state().session.live.ready, true);
  clock.tick(60000); await flush();
  assert.equal(state().session.live.text, false);
  assert.equal(voice.stopped, 0);
});

test('no microphone: the test still works, by typing and tapping, with no error banner', async () => {
  const { session, voice, state, texts } = setup();
  voice.failWith = Object.assign(new Error('Microphone permission was denied.'), { code: 'mic' });
  await session.start('test', 5);
  await flush();
  assert.equal(state().banner, null);
  assert.equal(state().session.live.text, true);
  assert.equal(state().session.question.question_id, 11);
  assert.ok(texts().some((x) => /Question 1 of 3/.test(x)));
  assert.ok(state().toasts.some((x) => /microphone is not available/.test(x.text)));
});

test('another start-up failure (backend down) is still the red banner, not text mode', async () => {
  const { session, voice, state } = setup();
  voice.failWith = new Error('Voice connection failed. Is the backend running?');
  await session.start('test', 5);
  assert.equal(state().banner, 'Voice connection failed. Is the backend running?');
  assert.equal(state().session.live.text, false);
});

test('without a backend there is no text mode: the old behaviour stays', async () => {
  const { session, voice, state } = setup({ withBackend: false });
  voice.failWith = Object.assign(new Error('Microphone permission was denied.'), { code: 'mic' });
  await session.start('test', 5);
  assert.equal(state().banner, 'Microphone permission was denied.');
});

test('text mode runs the whole test: Q1, Q2, Q3 (each moving on after 3 s) and then the Summary', async () => {
  const { clock, session, voice, state, calls } = setup();
  voice.failWith = Object.assign(new Error('mic'), { code: 'mic' });
  await session.start('test', 5); await flush();
  assert.equal(state().session.question.number, 1);
  await session.answer('A'); await flush();
  assert.equal(state().session.result.is_correct, true);
  assert.equal(state().session.result.before, 38);
  assert.equal(state().session.result.after, 47.3);                          // the result card has what it needs, in view of the question
  clock.tick(3001); await flush();                                           // auto-advance
  assert.equal(state().session.question.number, 2);
  assert.equal(state().session.result, null);
  await session.answer('B'); await flush();
  assert.equal(state().session.result.is_correct, false);
  await session.nextQuestion(); await flush();                               // the "Next question →" button: at once, no waiting
  assert.equal(state().session.question.number, 3);
  await session.answer('A'); await flush();
  assert.equal(state().session.summary.total, 3);                            // reaches the Summary
  assert.equal(state().session.summary.correct, 2);
  assert.equal(state().session.phase.phase, 'summary');
  clock.tick(60000); await flush();
  assert.equal(state().session.question.number, 3);                          // nothing more to advance to
  assert.deepEqual(calls.submit.map(([id]) => id), [11, 12, 13]);
});

test('a live call that never grades a tapped option is graded by text mode after 12 s', async () => {
  const { clock, session, voice, state, ask, calls } = setup();
  await session.start('test', 5);
  session.handleEvent({ type: 'session', id: 'abc' });
  ask(1);
  session.answer('B');
  assert.deepEqual(voice.sent, ['B']);                                       // first it goes to the live call
  clock.tick(11999); await flush();
  assert.equal(state().session.live.text, false);
  clock.tick(2); await flush();
  assert.equal(state().session.live.text, true);
  assert.equal(voice.stopped, 1);
  assert.deepEqual(calls.submit, [[11, 'B']]);
  assert.equal(state().session.result.chosen, 'B');
  assert.equal(state().session.question.question_id, 11);                    // the same question stays on screen with its grade
});

test('a tapped option that is graded in time is left alone', async () => {
  const { clock, session, voice, state, ask, grade, calls } = setup();
  await session.start('test', 5);
  session.handleEvent({ type: 'session', id: 'abc' });
  ask(1); session.answer('A'); clock.tick(2000); grade(1);
  clock.tick(60000); await flush();
  assert.equal(state().session.live.text, false);
  assert.equal(voice.stopped, 0);
  assert.deepEqual(calls.submit, []);
});

test('live test: after a graded answer, silence for 3 s makes the next question be asked for', async () => {
  const { clock, session, voice, ask, grade } = setup();
  await session.start('test', 5);
  session.handleEvent({ type: 'session', id: 'abc' });
  ask(1); grade(1);
  clock.tick(2999); assert.deepEqual(voice.sent, []);
  clock.tick(2); assert.deepEqual(voice.sent, ['Next question, please.']);
});

test('live test: nothing is sent if the next question arrived by itself, while Eklavya is speaking, or after the last question', async () => {
  const a = setup();
  await a.session.start('test', 5); a.session.handleEvent({ type: 'session', id: 'x' });
  a.ask(1); a.grade(1); a.clock.tick(1000); a.ask(2); a.clock.tick(60000);
  assert.deepEqual(a.voice.sent, []);                                        // Q2 came by itself

  const b = setup();
  await b.session.start('test', 5); b.session.handleEvent({ type: 'session', id: 'x' });
  b.ask(1); b.grade(1); b.voice.status = 'speaking';
  b.clock.tick(3001); assert.deepEqual(b.voice.sent, []);                    // still talking: wait
  b.voice.status = 'listening'; b.clock.tick(1501); assert.deepEqual(b.voice.sent, ['Next question, please.']);

  const c = setup();
  await c.session.start('test', 5); c.session.handleEvent({ type: 'session', id: 'x' });
  c.ask(3); c.grade(3); c.clock.tick(60000);
  assert.deepEqual(c.voice.sent, []);                                        // that was the last one: the summary comes from the server
});

test('"Next question →" in a live call asks for it at once', async () => {
  const { clock, session, voice, ask, grade } = setup();
  await session.start('test', 5); session.handleEvent({ type: 'session', id: 'x' });
  ask(1); grade(1);
  session.nextQuestion();
  assert.deepEqual(voice.sent, ['Next question, please.']);
  clock.tick(60000);
  assert.deepEqual(voice.sent, ['Next question, please.']);                  // the timer was cancelled: not asked twice
});

test('the reply bubble is filled from the notes when Eklavya\'s words never arrive', async () => {
  const { clock, session, voice, state, texts, calls } = setup();
  await session.start('free'); session.handleEvent({ type: 'session', id: 'x' });
  session.handleEvent({ type: 'transcript', role: 'user', text: 'mujhe precision samjhao', final: true });
  clock.tick(19999); await flush(); assert.deepEqual(calls.ask, []);
  clock.tick(2); await flush();
  assert.deepEqual(calls.ask, ['mujhe precision samjhao']);
  assert.equal(state().session.messages.at(-1).role, 'tutor');
  assert.match(texts().at(-1), /From your notes: mujhe precision samjhao/);
  assert.equal(voice.stopped, 0);                                            // the call itself carries on
});

test('the bubble is filled 8 s after the turn ends with no words', async () => {
  const { clock, session, texts, calls } = setup();
  await session.start('free'); session.handleEvent({ type: 'session', id: 'x' });
  session.handleEvent({ type: 'transcript', role: 'user', text: 'explain recall', final: true });
  session.handleEvent({ type: 'turn_complete' });
  clock.tick(7999); await flush(); assert.deepEqual(calls.ask, []);
  clock.tick(2); await flush();
  assert.deepEqual(calls.ask, ['explain recall']);
  assert.match(texts().at(-1), /explain recall/);
});

test('nothing is filled in when Eklavya answers, shows a board, or asks the next question', async () => {
  for (const reply of [
    (s) => s.handleEvent({ type: 'transcript', role: 'tutor', text: 'Sure,', final: false }),
    (s) => s.handleEvent({ type: 'board', kind: 'steps', title: 'T', items: ['a'], highlight: 0 }),
    (s) => s.handleEvent({ type: 'quiz_question', question_id: 11, question: 'Q?', options: ['A. x'], topic: 'P', number: 1, total: 3 }),
  ]) {
    const { clock, session, calls } = setup();
    await session.start('free'); session.handleEvent({ type: 'session', id: 'x' });
    session.handleEvent({ type: 'transcript', role: 'user', text: 'hello there', final: true });
    reply(session);
    clock.tick(120000); await flush();
    assert.deepEqual(calls.ask, []);
  }
});

test('if even the notes cannot answer, the bubble still says something instead of staying empty', async () => {
  const { clock, session, texts } = setup({ askFails: true });
  await session.start('free'); session.handleEvent({ type: 'session', id: 'x' });
  session.handleEvent({ type: 'transcript', role: 'user', text: 'hello there', final: true });
  clock.tick(20001); await flush();
  assert.match(texts().at(-1), /could not get my answer out/);
});

test('a spoken "option B" that gets no grade is graded by text mode, not sent to the notes as a question', async () => {
  const { clock, session, ask, state, calls } = setup();
  await session.start('test', 5); session.handleEvent({ type: 'session', id: 'x' });
  ask(1);
  session.handleEvent({ type: 'transcript', role: 'user', text: 'option B', final: true });
  clock.tick(20001); await flush();
  assert.deepEqual(calls.ask, []);
  assert.deepEqual(calls.submit, [[11, 'B']]);
  assert.equal(state().session.live.text, true);
});

test('in text mode typed text works: a letter answers the open question, a sentence asks the notes', async () => {
  const { session, voice, state, texts, calls } = setup();
  voice.failWith = Object.assign(new Error('mic'), { code: 'mic' });
  await session.start('test', 5); await flush();
  session.sendText('what is recall'); await flush();
  assert.deepEqual(calls.ask, ['what is recall']);
  assert.ok(texts().includes('what is recall') && texts().some((x) => /From your notes: what is recall/.test(x)));
  session.sendText('b'); await flush();
  assert.deepEqual(calls.submit, [[11, 'B']]);
  assert.equal(state().session.result.chosen, 'B');
});

test('learn mode in text mode explains the topic first, then asks the questions', async () => {
  const { session, voice, state, calls, texts } = setup();
  voice.failWith = Object.assign(new Error('mic'), { code: 'mic' });
  await session.start('learn', 5); await flush();
  assert.match(calls.ask[0], /Teach me/);
  assert.ok(texts().some((x) => /From your notes: Teach me/.test(x)));
  assert.equal(state().session.question.question_id, 11);
  assert.equal(state().session.question.total, 3);
});

test('viva and debate cannot run in text mode, and say so', async () => {
  const { session, voice, texts, state } = setup();
  voice.failWith = Object.assign(new Error('mic'), { code: 'mic' });
  await session.start('viva', 5); await flush();
  assert.ok(texts().some((x) => /need your voice/.test(x)));
  assert.equal(state().session.question, null);
});

test('ending a text-mode session closes it, and a new session starts clean', async () => {
  const { session, voice, state } = setup();
  voice.failWith = Object.assign(new Error('mic'), { code: 'mic' });
  await session.start('test', 5); await flush();
  assert.equal(state().voiceStatus, 'listening');
  session.stop();
  assert.equal(state().voiceStatus, 'idle');
  assert.equal(state().session.live.text, false);
  voice.failWith = null;
  await session.start('free');
  assert.equal(state().session.live.text, false);
  assert.equal(state().session.live.ready, false);
});

test('leaving text mode through the orb starts a free voice call again', async () => {
  const { session, voice, state } = setup();
  voice.failWith = Object.assign(new Error('mic'), { code: 'mic' });
  await session.start('test', 5); await flush();
  voice.failWith = null;
  await session.toggle();
  assert.equal(voice.started.length, 1);
  assert.equal(voice.started[0].mode, 'free');
  assert.equal(state().session.live.text, false);
});
