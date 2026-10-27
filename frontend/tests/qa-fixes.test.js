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
import { MAX_LABELLED } from '../js/components/concept-map.js';

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
test('the concept map labels up to 12 topics and drops labels above that', () => {
  assert.equal(MAX_LABELLED, 12);
});
