// Phase 2-4 frontend logic: interface language, viva and debate state, Today/plan/flashcards controller,
// celebrations, photos in a call, concept-map maths. Fakes only: no browser, no server.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../js/state/store.js';
import { initialState, reducer, VIEWS } from '../js/state/reducer.js';
import { actions } from '../js/state/actions.js';
import { createNotifier } from '../js/controllers/notifier.js';
import { createSessionController } from '../js/controllers/session-controller.js';
import { createHomeController } from '../js/controllers/home-controller.js';
import { HINDI_KEYS, KEYS, t, uiLang } from '../js/lib/strings.js';
import { masteryStep, ringLayout } from '../js/components/concept-map.js';

const run = (...acts) => acts.reduce((state, action) => reducer(state, action), initialState);

// ------------------------------------------------------------------ strings
test('every interface label has a Hindi version, and Hinglish uses the English labels', () => {
  assert.deepEqual(KEYS.filter((key) => !HINDI_KEYS.includes(key)), []);
  assert.equal(t('tab.today', 'hindi'), 'आज');
  assert.equal(t('tab.today', 'hinglish'), 'Today');
  assert.equal(t('viva.question', 'english', { n: 2, total: 5 }), 'Question 2 of 5');
  assert.equal(t('today.streak', 'hindi', { n: 3 }), 'लगातार 3 दिन');
  assert.equal(t('no.such.key', 'hindi'), 'no.such.key');
  assert.equal(uiLang('hindi'), 'hi');
});

// ------------------------------------------------------------------ reducer
test('a viva collects marks per question and ends with a report card', () => {
  const q1 = { number: 1, total: 5, question: 'What is precision?', seconds: 90 };
  let s = run(actions.sessionStarted({ mode: 'viva', topicId: 3 }), actions.vivaQuestionAsked(q1),
    actions.vivaMarked({ number: 1, mark: 1.5, out_of: 2, feedback: 'thin' }));
  assert.equal(s.session.viva.question, q1);
  s = reducer(s, actions.vivaMarked({ number: 1, mark: 2, out_of: 2, feedback: 'better' }));   // re-marked: replaced
  assert.deepEqual(s.session.viva.marks.map((m) => m.mark), [2]);
  s = reducer(s, actions.vivaReported({ marks: 8, out_of: 10, percent: 80, answers: [] }));
  assert.equal(s.session.viva.question, null);
  assert.equal(s.session.viva.report.marks, 8);
  assert.equal(s.session.viva.marks.length, 1);
});

test('debate scores pile up and the verdict is kept; a new session clears both', () => {
  let s = run(actions.debateScored({ round: 1, strength: 6, average: 6 }), actions.debateScored({ round: 2, strength: 8, average: 7 }),
    actions.debateJudged({ winner: 'student' }));
  assert.equal(s.session.debateScores.length, 2);
  assert.equal(s.session.verdict.winner, 'student');
  s = reducer(s, actions.sessionStarted({ mode: 'debate', topicId: 1 }));
  assert.deepEqual([s.session.debateScores, s.session.verdict], [[], null]);
});

test('language, captions, onboarding and celebrations live in ui state', () => {
  let s = run(actions.languageChanged('hindi'), actions.captionsToggled(), actions.onboardingSet(true), actions.celebrated({ id: 1, text: 'x' }));
  assert.deepEqual([s.ui.language, s.ui.captions, s.ui.onboarding, s.ui.celebration.text], ['hindi', true, true, 'x']);
  assert.equal(reducer(s, actions.languageChanged('klingon')), s);
  s = reducer(s, actions.captionsToggled());
  assert.equal(s.ui.captions, false);
});

test('the app opens on Today; new notes clear the old concept map and flashcards', () => {
  assert.equal(initialState.ui.view, VIEWS.TODAY);
  const s = run(actions.conceptMapLoaded({ nodes: [1], links: [] }), actions.flashcardsLoaded({ topicId: 3, cards: [{}] }), actions.notesReset());
  assert.deepEqual([s.conceptMap, s.flashcards], [null, { topicId: null, cards: [] }]);
});

test('a shared photo is its own message with a preview, even while Eklavya is mid-sentence', () => {
  const s = run(actions.transcriptReceived({ role: 'user', text: 'Hm', final: false }),
    actions.transcriptReceived({ role: 'user', text: 'You shared a photo', final: true, image: 'data:image/jpeg;base64,AA' }));
  assert.equal(s.session.messages.length, 2);
  assert.equal(s.session.messages[1].image, 'data:image/jpeg;base64,AA');
});

// ------------------------------------------------------------------ session controller
function sessionSetup() {
  const store = createStore(reducer, initialState);
  const notifier = createNotifier(store, { schedule: () => {} });
  const progress = [];
  const voice = { status: 'listening', photos: [], start: async () => {}, stop() {}, sendText() {},
    sendPhoto(photo) { this.photos.push(photo); return true; } };
  const notes = { refresh: async () => {} };
  const session = createSessionController({ store, notes, notifier, userId: 1, getLanguage: () => 'hinglish',
    onProgress: () => progress.push(1), preparePhoto: async (file) => ({ mime: 'image/jpeg', data: 'QUJD', previewUrl: `preview:${file.name}` }) });
  session.attach(voice);
  return { store, session, voice, progress };
}

test('session: viva and debate events reach the state; finished results refresh Today and history', () => {
  const { store, session, progress } = sessionSetup();
  session.handleEvent({ type: 'viva_question', number: 1, total: 5, question: 'Q?', seconds: 90 });
  session.handleEvent({ type: 'viva_mark', number: 1, mark: 2, out_of: 2, feedback: 'good' });
  session.handleEvent({ type: 'viva_report', marks: 9, out_of: 10, percent: 90, answers: [] });
  session.handleEvent({ type: 'debate_score', round: 1, evidence: 7, logic: 6, rebuttal: 5, strength: 6, average: 6, note: '' });
  session.handleEvent({ type: 'debate_verdict', winner: 'student', student_score: 7, eklavya_score: 6 });
  const s = store.getState();
  assert.equal(s.session.viva.report.marks, 9);
  assert.equal('type' in s.session.viva.report, false);
  assert.equal(s.session.debateScores[0].evidence, 7);
  assert.equal(s.session.verdict.winner, 'student');
  assert.equal(s.ui.celebration.text, 'You won the debate');
  assert.equal(progress.length, 2);
});

test('session: a correct answer that raises mastery is celebrated; a wrong one is not', () => {
  const { store, session } = sessionSetup();
  session.handleEvent({ type: 'mastery', topic: 'Precision', before: 38, after: 47.3, is_correct: true, misconception: null });
  assert.equal(store.getState().ui.celebration.text, 'Precision +9.3%');
  const first = store.getState().ui.celebration;
  session.handleEvent({ type: 'mastery', topic: 'Recall', before: 42, after: 35, is_correct: false, misconception: { text: 'x' } });
  assert.equal(store.getState().ui.celebration, first);
});

test('session: a photo is shrunk, sent and shown; without a call it is refused politely', async () => {
  const { store, session, voice } = sessionSetup();
  assert.equal(await session.sendPhoto({ name: 'page.jpg', type: 'image/jpeg' }), true);
  assert.deepEqual(voice.photos, [{ mime: 'image/jpeg', data: 'QUJD', previewUrl: 'preview:page.jpg' }]);
  assert.equal(store.getState().session.messages.at(-1).image, 'preview:page.jpg');
  voice.status = 'idle';
  assert.equal(await session.sendPhoto({ name: 'b.jpg', type: 'image/jpeg' }), false);
  assert.match(store.getState().toasts.at(-1).text, /Start a conversation first/);
});

// ------------------------------------------------------------------ home controller
function homeSetup(overrides = {}) {
  const store = createStore(reducer, initialState);
  const notifier = createNotifier(store, { schedule: () => {} });
  const calls = [];
  let streak = 1;
  const backend = {
    today: async () => { calls.push('today'); return { streak: streak++, plan: [], due: [], has_notes: true }; },
    plan: async () => ({ exam_date: null, plan: null }),
    conceptMap: async () => ({ nodes: [], links: [] }),
    history: async () => ({ vivas: [], debates: [] }),
    savePlan: async (date, minutes) => { calls.push(`save:${date}:${minutes}`); return { exam_date: date, minutes_per_day: minutes, plan: { days: [] } }; },
    clearPlan: async () => ({ exam_date: null, plan: null }),
    flashcards: async (topicId) => ({ cards: [{ id: 1, topic_id: topicId, front: 'F', back: 'B', source: 'notes' }] }),
    makeFlashcards: async (topicId) => { calls.push(`make:${topicId}`); return { cards: [{ id: 2, topic_id: topicId, front: 'N', back: 'B', source: 'notes' }] }; },
    ...overrides,
  };
  return { store, calls, home: createHomeController({ store, backend, notifier, userId: 1 }) };
}

test('home: refresh loads Today, plan, map and history; a growing streak (2+) is celebrated', async () => {
  const { store, home } = homeSetup();
  await home.refresh();
  assert.equal(store.getState().today.streak, 1);
  assert.deepEqual(store.getState().history, { vivas: [], debates: [] });
  assert.equal(store.getState().ui.celebration, null);          // first load: nothing to compare with
  await home.refreshToday();
  assert.equal(store.getState().ui.celebration.text, '2-day streak. Keep going.');
});

test('home: saving the exam date stores the plan and reloads Today; flashcards load and regenerate', async () => {
  const { store, calls, home } = homeSetup();
  assert.equal(await home.savePlan('2026-12-15', 45), true);
  assert.equal(store.getState().plan.exam_date, '2026-12-15');
  assert.deepEqual(calls, ['save:2026-12-15:45', 'today']);
  await home.loadFlashcards(3);
  assert.equal(store.getState().flashcards.cards[0].front, 'F');
  await home.makeFlashcards(3);
  assert.deepEqual([store.getState().flashcards.topicId, store.getState().flashcards.cards[0].front], [3, 'N']);
});

test('home: a failed save shows the backend message; a failed background refresh stays quiet', async () => {
  const { store, home } = homeSetup({
    savePlan: async () => { throw new Error('Pick an exam date after today.'); },
    today: async () => { throw new Error('offline'); },
  });
  assert.equal(await home.savePlan('2020-01-01', 30), false);
  assert.equal(store.getState().banner, 'Pick an exam date after today.');
  store.dispatch(actions.bannerSet(null));
  await home.refresh();
  assert.equal(store.getState().banner, null);
});

// ------------------------------------------------------------------ concept map maths
test('concept map: mastery picks one of five colour steps; topics sit evenly on a ring', () => {
  assert.deepEqual([0, 19, 21, 50, 79, 100].map(masteryStep), [1, 1, 2, 3, 4, 5]);
  const ring = ringLayout(4, 400);
  assert.equal(ring.length, 4);
  assert.ok(Math.abs(ring[0].x - 200) < 1e-9 && ring[0].y < 200);       // first topic at the top
  assert.ok(Math.abs(ring[2].x - 200) < 1e-9 && ring[2].y > 200);       // opposite one at the bottom
});
