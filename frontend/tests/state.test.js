// State layer: reducer transitions and the store. Run with `npm test` (Node 20+, no dependencies).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../js/state/store.js';
import { initialState, reducer, normalizeMission } from '../js/state/reducer.js';
import { actions } from '../js/state/actions.js';

const run = (...acts) => acts.reduce((state, action) => reducer(state, action), initialState);
const transcript = (role, text, final = false) => actions.transcriptReceived({ role, text, final });

test('transcript chunks grow one open bubble and the final text replaces it', () => {
  let s = run(transcript('tutor', 'Hello '), transcript('tutor', 'there'));
  assert.deepEqual(s.session.messages, [{ role: 'tutor', text: 'Hello there', final: false }]);
  s = reducer(s, transcript('tutor', 'Hello there!', true));
  assert.deepEqual(s.session.messages, [{ role: 'tutor', text: 'Hello there!', final: true }]);
  s = reducer(s, transcript('tutor', 'Next'));                       // a finished bubble is never reopened
  assert.equal(s.session.messages.length, 2);
});

test('user and tutor bubbles are tracked independently', () => {
  const s = run(transcript('user', 'mujhe '), transcript('tutor', 'Haan'), transcript('user', 'samjhao'));
  assert.deepEqual(s.session.messages.map((m) => [m.role, m.text]), [['user', 'mujhe samjhao'], ['tutor', 'Haan']]);
});

test('interrupting marks the open tutor bubble as cut and finished', () => {
  const s = run(transcript('tutor', 'Precision means'), actions.turnInterrupted());
  assert.deepEqual(s.session.messages[0], { role: 'tutor', text: 'Precision means', final: true, cut: true });
  assert.equal(reducer(s, actions.turnInterrupted()), s);            // nothing open: state is unchanged
});

test('a new session clears the old one and any banner, but keeps the mission', () => {
  let s = run(
    actions.bannerSet('boom'), transcript('user', 'hi'), actions.emotionReported({ topic: 'x' }),
    actions.missionReceived({ title: 'Fix it', priority: 'High', tasks: ['a'] }),
  );
  s = reducer(s, actions.sessionStarted({ mode: 'learn', topicId: 7 }));
  assert.equal(s.banner, null);
  assert.deepEqual(s.session, { mode: 'learn', topicId: 7, phase: null, messages: [], emotion: null, question: null, result: null, summary: null, boards: [], boardIndex: -1, viva: null, debateScores: [], verdict: null });
  assert.equal(s.mission.title, 'Fix it');
});

test('quiz flow: asking clears the previous result and summary', () => {
  let s = run(actions.questionAsked({ question_id: 1 }), actions.answerGraded({ is_correct: true }), actions.testSummarized({ correct: 1 }));
  assert.equal(s.session.result.is_correct, true);
  s = reducer(s, actions.questionAsked({ question_id: 2 }));
  assert.deepEqual([s.session.question.question_id, s.session.result, s.session.summary], [2, null, null]);
});

test('going idle clears the phase bar; other statuses leave it', () => {
  let s = run(actions.phaseChanged({ phase: 'test', topic: 'Precision' }));
  assert.deepEqual(reducer(s, actions.voiceStatusChanged('listening')).session.phase, { phase: 'test', topic: 'Precision' });
  s = reducer(s, actions.voiceStatusChanged('listening'));
  assert.equal(reducer(s, actions.voiceStatusChanged('idle')).session.phase, null);
});

test('mission shape is normalised from the dashboard and from the live event', () => {
  const fromDashboard = normalizeMission({ mission_title: 'Fix X', duration_minutes: 15, priority: 'High', reason: 'r', tasks: ['t'] });
  const fromEvent = normalizeMission({ title: 'Fix X', duration_minutes: 15, priority: 'High', reason: 'r', tasks: ['t'] });
  assert.deepEqual(fromDashboard, fromEvent);
  assert.equal(normalizeMission(null), null);
  assert.equal(run(actions.dashboardLoaded({ mastery: [], mission: { mission_title: 'M' } })).mission.title, 'M');
});

test('a dashboard without a mission does not erase the one already shown', () => {
  const s = run(actions.missionReceived({ title: 'Keep me' }), actions.dashboardLoaded({ mastery: [], mission: null }));
  assert.equal(s.mission.title, 'Keep me');
});

test('topic details apply only to the topic that is still selected', () => {
  let s = run(actions.topicSelected(1), actions.topicSelected(2));
  assert.equal(reducer(s, actions.topicLoaded({ topic_id: 1 })), s);                // late answer for topic 1 is ignored
  s = reducer(s, actions.topicLoaded({ topic_id: 2, topic_name: 'Recall' }));
  assert.equal(s.topicDetail.topic_name, 'Recall');
});

test('loading new notes resets topic, mission and session', () => {
  const s = run(actions.topicSelected(3), actions.topicLoaded({ topic_id: 3 }), actions.missionReceived({ title: 'M' }),
    transcript('user', 'hi'), actions.notesReset());
  assert.deepEqual([s.selectedTopicId, s.topicDetail, s.mission, s.session.messages], [null, null, null, []]);
});

test('toasts are added and removed by id', () => {
  const s = run(actions.toastAdded({ id: 1, kind: 'ok', text: 'a' }), actions.toastAdded({ id: 2, kind: 'bad', text: 'b' }), actions.toastRemoved(1));
  assert.deepEqual(s.toasts.map((t) => t.id), [2]);
});

test('unknown actions and no-op changes return the same state object', () => {
  assert.equal(reducer(initialState, { type: 'nope' }), initialState);
  assert.equal(reducer(initialState, actions.voiceStatusChanged('idle')), initialState);
  assert.equal(reducer(initialState, actions.bannerSet(null)), initialState);
});

test('the store notifies subscribers, supports unsubscribe, and skips no-op dispatches', () => {
  const store = createStore(reducer, initialState);
  let calls = 0;
  const off = store.subscribe(() => { calls++; });
  store.dispatch(actions.bannerSet('x'));
  store.dispatch(actions.bannerSet('x'));      // identical: no notification
  assert.equal(calls, 1);
  off();
  store.dispatch(actions.bannerSet('y'));
  assert.equal(calls, 1);
});

test('select renders immediately and again only when its slice changes', () => {
  const store = createStore(reducer, initialState);
  const seen = [];
  store.select((s) => s.banner, (banner) => seen.push(banner));
  store.dispatch(actions.voiceStatusChanged('listening'));    // unrelated change
  store.dispatch(actions.bannerSet('oops'));
  assert.deepEqual(seen, [null, 'oops']);
});

test('a listener that throws does not stop the other listeners', () => {
  const store = createStore(reducer, initialState);
  const seen = [];
  const original = console.error;
  console.error = () => {};                                   // keep the test output clean
  try {
    store.subscribe(() => { throw new Error('broken component'); });
    store.subscribe((state) => seen.push(state.banner));
    store.dispatch(actions.bannerSet('still delivered'));
  } finally {
    console.error = original;
  }
  assert.deepEqual(seen, ['still delivered']);
});
