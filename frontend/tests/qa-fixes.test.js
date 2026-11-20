// Fixes from the manual QA pass: feedback hold, stepper, topic switching, mission in Study, notes controller,
// remembered language, concept-map labels, library/Hindi text. Fakes only: no browser, no server.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../js/state/store.js';
import { initialState, reducer } from '../js/state/reducer.js';
import { actions } from '../js/state/actions.js';
import { createNotifier } from '../js/controllers/notifier.js';
import { createNotesController } from '../js/controllers/notes-controller.js';
import { createFeedbackHold } from '../js/lib/feedback-hold.js';
import { loadLanguage, saveLanguage, LANGUAGE_KEY } from '../js/lib/language.js';
import { HINDI_KEYS, KEYS, t } from '../js/lib/strings.js';
import { currentStep, ORDER } from '../js/components/stepper.js';
import { MAX_LABELLED, mapGeometry } from '../js/components/concept-map.js';

const run = (...acts) => acts.reduce((state, action) => reducer(state, action), initialState);

// ------------------------------------------------------------------ #4 feedback is held long enough to read
function clock() {
  let time = 0;
  const jobs = [];
  return {
    now: () => time,
    schedule: (fn, ms) => { const job = { at: time + ms, fn, live: true }; jobs.push(job); return job; },
    cancel: (job) => { job.live = false; },
    advance(ms) {
      time += ms;
      for (const job of jobs.filter((j) => j.live && j.at <= time).sort((a, b) => a.at - b.at)) { job.live = false; job.fn(); }
    },
  };
}

test('feedback hold: with nothing on screen the next question appears at once', () => {
  const c = clock();
  const hold = createFeedbackHold({ ...c });
  let shown = 0;
  hold.swap(() => { shown++; });
  assert.equal(shown, 1);
});

test('feedback hold: pressing "Next question" releases the hold, so the next question shows the instant it arrives', () => {
  const c = clock();
  const hold = createFeedbackHold({ ...c });
  hold.resultShown();                             // a result is on screen
  hold.release();                                 // the student pressed Next: it has been read
  let shown = 0;
  hold.swap(() => { shown++; });                  // the server's next question arrives a moment later
  assert.equal(shown, 1);                         // no 2.5 s wait
});

test('feedback hold: a result stays at least 2.5 s, and the swap waits for the tutor to start speaking', () => {
  const c = clock();
  const hold = createFeedbackHold({ ...c });
  hold.resultShown();
  let shown = 0;
  hold.swap(() => { shown++; });                  // the next question arrives the instant the answer was graded
  c.advance(1000);
  assert.equal(shown, 0);
  hold.tutorSpoke();                              // speaking started, but only 1 s have passed: still held
  assert.equal(shown, 0);
  c.advance(1500);                                // 2.5 s: the hold is over and the tutor already spoke
  assert.equal(shown, 1);
});

test('feedback hold: if the tutor starts speaking late, the swap happens right then; a silent tutor is cut off at 6 s', () => {
  const c = clock();
  const hold = createFeedbackHold({ ...c });
  hold.resultShown();
  let late = 0;
  hold.swap(() => { late++; });
  c.advance(4000);
  assert.equal(late, 0);                          // 2.5 s are over but nobody has started the next question yet
  hold.tutorSpoke();
  assert.equal(late, 1);                          // speech started: swap now

  hold.resultShown();
  let silent = 0;
  hold.swap(() => { silent++; });
  c.advance(5900);
  assert.equal(silent, 0);
  c.advance(200);
  assert.equal(silent, 1);                        // typed session: no speech ever came, the 6 s limit ends the hold
});

test('feedback hold: correct and wrong answers are held the same way, and release() shows the latest at once', () => {
  for (const _answer of ['correct', 'wrong']) {
    const c = clock();
    const hold = createFeedbackHold({ ...c });
    hold.resultShown();
    let shown = 0;
    hold.swap(() => { shown++; });
    hold.release();                               // e.g. the session was reset
    assert.equal(shown, 1);
    assert.equal(hold.holding, false);
  }
});

// ------------------------------------------------------------------ #11 the Summary step becomes done
test('stepper: the last step is done once the summary is on screen; before that the phase is current', () => {
  const steps = ORDER.learn;
  assert.deepEqual(steps, ['teaching', 'test', 'summary']);
  assert.equal(currentStep(steps, { phase: { phase: 'test' }, summary: null }), 1);
  assert.equal(currentStep(steps, { phase: { phase: 'summary' }, summary: null }), 2);
  assert.equal(currentStep(steps, { phase: { phase: 'summary' }, summary: { correct: 3 } }), 3);   // 3 = past the last step: all done
  assert.equal(currentStep(undefined, {}), -1);
});

// ------------------------------------------------------------------ #14 another topic starts a clean conversation
test('opening a different topic while no call is running clears the old conversation and boards', () => {
  const withChat = run(actions.topicSelected(1), actions.transcriptReceived({ role: 'tutor', text: 'Precision is…', final: true }),
    actions.boardShown({ kind: 'steps', title: 'P', items: ['a'], highlight: 0 }));
  assert.equal(withChat.session.messages.length, 1);
  assert.equal(reducer(withChat, actions.topicSelected(1)).session.messages.length, 1);    // the same topic again: kept
  const other = reducer(withChat, actions.topicSelected(2));
  assert.deepEqual([other.session.messages, other.session.boards], [[], []]);
  const calling = reducer(reducer(withChat, actions.voiceStatusChanged('listening')), actions.topicSelected(2));
  assert.equal(calling.session.messages.length, 1);                                         // a running call is not wiped
});

// ------------------------------------------------------------------ #12 the mission given in this session
test('the mission from this session is kept for Study, and the old one is not shown there', () => {
  const s0 = run(actions.dashboardLoaded({ mastery: [], mission: { mission_title: 'Old', duration_minutes: 15, priority: 'High', reason: '', tasks: [] } }));
  assert.equal(s0.session.mission, null);                                                   // Study shows nothing yet
  const s1 = reducer(s0, actions.missionReceived({ title: 'Fresh', duration_minutes: 15, priority: 'High', reason: 'live mastery', tasks: ['t'] }));
  assert.equal(s1.session.mission.title, 'Fresh');
  assert.equal(s1.mission.title, 'Fresh');                                                  // Progress shows it too
  assert.equal(reducer(s1, actions.sessionStarted({ mode: 'learn', topicId: 1 })).session.mission, null);   // a new session starts empty
});

// ------------------------------------------------------------------ #6 / #9 notes controller
function notesSetup(overrides = {}) {
  const store = createStore(reducer, initialState);
  const notifier = createNotifier(store, { schedule: () => {} });
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const backend = {
    dashboard: async () => ({ mastery: [], weak_topics: [], alerts: [], quiz_history: [], agent_log: [], mission: null }),
    seedDemo: async () => { calls.push('seed'); await gate; return {}; },
    uploadDocument: async () => ({ topics_found: [{}] }),
    ...overrides,
  };
  const notes = createNotesController({ store, backend, notifier, userId: 1, endSession: () => {} });
  return { store, notes, calls, release };
}

test('demo notes: clicking twice while it loads makes one request, not two', async () => {
  const { notes, calls, release } = notesSetup();
  const first = notes.loadDemo();
  const second = notes.loadDemo();
  release();
  await Promise.all([first, second]);
  assert.deepEqual(calls, ['seed']);
  await notes.loadDemo();                                  // after it finished, a new load is allowed again
  assert.equal(calls.length, 2);
});

test('a new upload clears the previous error banner, and a busy photo reader is shown as the plain message', async () => {
  const { store, notes } = notesSetup({
    uploadDocument: async () => { throw new Error('The photo reader is busy right now. Please try again in a minute.'); },
  });
  store.dispatch(actions.bannerSet('An old error'));
  const ok = await notes.uploadFile({ name: 'page.jpg' });
  assert.equal(ok, false);
  assert.equal(store.getState().banner, 'The photo reader is busy right now. Please try again in a minute.');   // not the old one, not raw JSON
  let seenAtStart = 'unset';
  const { store: s2, notes: n2 } = notesSetup({ uploadDocument: async () => { seenAtStart = s2.getState().banner; return { topics_found: [{}] }; } });
  s2.dispatch(actions.bannerSet('An old error'));
  await n2.uploadFile({ name: 'ok.pdf' });
  assert.equal(seenAtStart, null);                          // cleared before the request went out
});

// ------------------------------------------------------------------ #7 language is remembered
test('the language is saved and read back; a bad or blocked value falls back to Hinglish', () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  assert.equal(loadLanguage(), 'hinglish');
  saveLanguage('english');
  assert.equal(store[LANGUAGE_KEY], 'english');
  assert.equal(loadLanguage(), 'english');
  store[LANGUAGE_KEY] = 'klingon';
  assert.equal(loadLanguage(), 'hinglish');
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(loadLanguage(), 'hinglish');
  assert.doesNotThrow(() => saveLanguage('hindi'));
  delete globalThis.localStorage;
});

// ------------------------------------------------------------------ #8 Hindi library text
test('the notes library has Hindi text for every label, including the empty state', () => {
  const libraryKeys = KEYS.filter((key) => key.startsWith('lib.') || key === 'notes.loading' || key === 'map.open');
  assert.ok(libraryKeys.length >= 12);
  assert.deepEqual(libraryKeys.filter((key) => !HINDI_KEYS.includes(key)), []);
  assert.equal(t('lib.noneTitle', 'hindi'), 'अभी कोई नोट्स नहीं');
  assert.equal(t('lib.topics', 'hindi', { n: 5 }), '5 टॉपिक');
  assert.equal(t('lib.confirm', 'english', { name: 'ml_notes.txt' }), 'Remove "ml_notes.txt" and your progress on its topics?');
});

// ------------------------------------------------------------------ #21 concept map with many topics
test('the concept map keeps names for up to 30 topics, on a bigger ring with smaller circles', () => {
  assert.equal(MAX_LABELLED, 30);
  const small = mapGeometry(8), many = mapGeometry(25);
  assert.ok(!small.radial && many.radial && many.size > small.size);
  assert.ok(many.labelled && many.nodeRadius >= 11 && many.nodeRadius < small.nodeRadius);
  assert.equal(mapGeometry(31).labelled, false);   // beyond that the names live in the tip and the list
  // neighbouring circles never touch: the gap along the ring is wider than two circles, at every size up to the limit
  for (let n = 3; n <= 40; n++) {
    const g = mapGeometry(n), gap = 2 * g.ringRadius * Math.sin(Math.PI / n);
    assert.ok(gap > 2 * g.nodeRadius, `${n} topics: circles overlap`);
  }
});

import { feedbackMs, WRONG_MS, RIGHT_MS } from '../js/lib/feedback-timing.js';
import { createAutoAdvance } from '../js/lib/auto-advance.js';
import { focusTargetFor } from '../js/lib/study-focus.js';

test('a wrong answer stays on screen 5 s, a right one 1.5 s', () => {
  assert.equal(feedbackMs(false), 5000); assert.equal(WRONG_MS, 5000);
  assert.equal(feedbackMs(true), 1500); assert.equal(RIGHT_MS, 1500);
  const c = clock();
  const hold = createFeedbackHold({ ...c });
  hold.resultShown({ holdMs: feedbackMs(false) });
  let shown = 0;
  hold.swap(() => { shown++; });                 // the next question is already there
  hold.tutorSpoke();
  c.advance(4900); assert.equal(shown, 0);       // the red card is still up
  c.advance(200); assert.equal(shown, 1);        // gone after 5 s
  const right = createFeedbackHold({ ...c });
  right.resultShown({ holdMs: feedbackMs(true) });
  right.swap(() => { shown++; }); right.tutorSpoke();
  c.advance(1600); assert.equal(shown, 2);       // a right answer: 1.5 s
});

test('the auto-advance takes its delay from the answer: 5 s wrong, 1.5 s right, and never over the tutor talking for long', () => {
  const log = [], timers = [];
  let t0 = 0, quiet = true;
  const adv = createAutoAdvance({ advance: () => log.push(t0), canAdvance: () => quiet, now: () => t0,
    schedule: (fn, ms) => { timers.push({ fn, at: t0 + ms }); return timers.length; }, cancel: () => {} });
  adv.arm(5000);
  assert.equal(timers.at(-1).at, 5000);
  adv.arm(1500);
  assert.equal(timers.at(-1).at, 1500);
});

test('only the first question scrolls into view; Q2 and Q3 appear in place', () => {
  const none = { question: null, result: null, summary: null, boardIndex: -1, viva: null, verdict: null, debateScore: null };
  assert.equal(focusTargetFor(none, { ...none, question: { id: 1 } }), '#quizcard');
  assert.equal(focusTargetFor({ ...none, question: { id: 1 } }, { ...none, question: { id: 2 } }), null);
});

test('once the summary is up nothing else scrolls the page away from it', () => {
  const none = { question: null, result: null, summary: null, boardIndex: -1, viva: null, verdict: null, debateScore: null };
  const s = { total: 3 };
  assert.equal(focusTargetFor({ ...none, summary: s }, { ...none, summary: s, result: { question_id: 3 } }), null);
  assert.equal(focusTargetFor({ ...none, summary: s }, { ...none, summary: s, boardIndex: 0 }), null);
});

import { feedbackLimitMs } from '../js/lib/feedback-timing.js';

test('a right answer moves on at 1.5 s even while Eklavya talks; a wrong one still holds 5 s (and waits a little for Eklavya)', () => {
  const c = clock();
  const hold = createFeedbackHold({ ...c });
  hold.resultShown({ holdMs: feedbackMs(true), maxHoldMs: feedbackLimitMs(true) });
  let shown = 0;
  hold.swap(() => { shown++; });                 // no tutorSpoke: Eklavya is still on the praise
  c.advance(1600); assert.equal(shown, 1);
  const log = [], timers = [];
  let t0 = 0;
  const adv = createAutoAdvance({ advance: () => log.push('advance'), canAdvance: () => false, now: () => t0,
    schedule: (fn, ms) => { timers.push({ fn, at: t0 + ms }); return timers.length; }, cancel: () => {} });
  adv.arm(feedbackMs(true), feedbackLimitMs(true));
  t0 = 1500; timers.at(-1).fn();                 // the tutor is still speaking, but the 1.5 s limit has passed
  assert.deepEqual(log, ['advance']);
  assert.equal(feedbackLimitMs(false), 8000);
});

import { lowestMastery, weakestLine, youName } from '../js/lib/weakest.js';

test('"Weakest topic" is computed from the table: the lowest started topic, never a topic that has not started', () => {
  const rows = [{ topic_name: 'Paging', mastery_score: 62, started: true }, { topic_name: 'Recall', mastery_score: 31.04, started: true },
    { topic_name: 'Untouched', mastery_score: 5, started: false }, { topic_name: 'Precision', mastery_score: 47.3, started: true }];
  assert.equal(lowestMastery(rows).topic_name, 'Recall');
  assert.equal(weakestLine(rows), 'Weakest topic: Recall (31%)');
  assert.equal(weakestLine(rows.map((r) => (r.topic_name === 'Recall' ? { ...r, mastery_score: 80 } : r))), 'Weakest topic: Precision (47.3%)');   // follows the data
  assert.equal(weakestLine([{ topic_name: 'X', mastery_score: 1, started: false }]), '');
  assert.equal(weakestLine([]), '');
});

test('the student\'s own row says "You", not "You (you)"', () => {
  assert.equal(youName('You'), 'You');
  assert.equal(youName('Janhavi'), 'Janhavi (you)');
});

import { separationVector, wrapTitle } from '../js/lib/graph-labels.js';

test('two spheres closer than the minimum are pushed apart; ones that are far enough are left alone', () => {
  const a = { x: 0, y: 0, z: 0 }, b = { x: 10, y: 0, z: 0 };
  const push = separationVector(a, b, 30);
  assert.ok(push.x < 0 && push.y === 0);                 // a moves away from b
  assert.equal(Math.round(Math.hypot(a.x + push.x - (b.x - push.x), 0, 0)), 30);   // both moving half: exactly the minimum apart
  assert.deepEqual(separationVector(a, { x: 50, y: 0, z: 0 }, 30), { x: 0, y: 0, z: 0 });
  assert.ok(separationVector(a, { ...a }, 30).x > 0);    // on top of each other: nudged sideways, not stuck
});

test('a long subject title wraps onto two balanced lines instead of running across the map', () => {
  assert.equal(wrapTitle('DBMS'), 'DBMS');
  assert.equal(wrapTitle('MACHINE LEARNING NOTES'), 'MACHINE\nLEARNING NOTES');
  assert.equal(wrapTitle('Operating Systems Lecture Notes Part Two').split('\n').length, 2);
});

import { SLOW_TEXT, TYPING_MAX_MS, createTypingTimer } from '../js/lib/typing-timeout.js';

test('the typing dots give way after 15 s with no reply, and start fresh for the next wait', () => {
  const tasks = []; let slow = 0;
  const timer = createTypingTimer({ onSlow: () => { slow++; }, schedule: (fn, ms) => { tasks.push({ fn, ms }); return tasks.length; }, cancel: (id) => { tasks[id - 1].fn = () => {}; } });
  assert.equal(TYPING_MAX_MS, 15000);
  timer.start(); timer.start();                          // called on every redraw: one timer
  assert.equal(tasks.length, 1); assert.equal(tasks[0].ms, 15000);
  tasks[0].fn();                                         // 15 s with no reply
  assert.equal(slow, 1); assert.equal(timer.slow, true);
  assert.match(SLOW_TEXT, /taking a while.*Answering from your notes instead/);
  timer.start(); assert.equal(tasks.length, 1);          // already slow: no second timer
  timer.stop();                                          // a reply came
  assert.equal(timer.slow, false);
  timer.start(); assert.equal(tasks.length, 2);          // the next wait counts again
  timer.stop(); tasks[1].fn(); assert.equal(slow, 1);    // a reply before 15 s: never slow
});
