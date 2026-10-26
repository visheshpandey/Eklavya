// Controllers and the API client, with fake backend/voice so no browser or server is needed.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../js/state/store.js';
import { initialState, reducer } from '../js/state/reducer.js';
import { createNotifier, describeError } from '../js/controllers/notifier.js';
import { createNotesController } from '../js/controllers/notes-controller.js';
import { createSessionController } from '../js/controllers/session-controller.js';
import { ApiError, backend } from '../js/services/api-client.js';

function setup({ backendOverrides = {} } = {}) {
  const store = createStore(reducer, initialState);
  const timers = [];
  const notifier = createNotifier(store, { schedule: (fn) => timers.push(fn) });
  const calls = [];
  const fakeBackend = {
    dashboard: async () => { calls.push('dashboard'); return { mastery: [{ topic_id: 1 }], weak_topics: [], alerts: [], quiz_history: [], agent_log: [], mission: null }; },
    seedDemo: async () => { calls.push('seed'); return {}; },
    uploadDocument: async (file) => { calls.push(`upload:${file.name}`); return { topics_found: [{}, {}] }; },
    deleteDocument: async (id) => { calls.push(`delete:${id}`); return { deleted: id }; },
    topic: async (id) => { calls.push(`topic:${id}`); return { topic_id: id, topic_name: 'Precision', notes: [], open_misconceptions: [], mastery: 38, question_count: 3 }; },
    ...backendOverrides,
  };
  let sessionEnded = 0;
  const notes = createNotesController({ store, backend: fakeBackend, notifier, userId: 1, endSession: () => { sessionEnded++; } });
  const voice = { status: 'idle', started: [], stopped: 0, sent: [], failWith: null,
    async start(opts) { if (this.failWith) throw this.failWith; this.started.push(opts); this.status = 'listening'; },
    stop() { this.stopped++; this.status = 'idle'; },
    sendText(t) { this.sent.push(t); } };
  const session = createSessionController({ store, notes, notifier, userId: 1, getLanguage: () => 'hinglish' });
  session.attach(voice);
  return { store, notifier, notes, session, voice, calls, timers, fakeBackend, endedCount: () => sessionEnded };
}

test('notifier: errors set the banner and a toast; toasts disappear when their timer fires', () => {
  const { store, notifier, timers } = setup();
  notifier.error(new Error('Gemini request failed: quota'));
  assert.equal(store.getState().banner, 'Gemini request failed: quota');
  assert.equal(store.getState().toasts.length, 1);
  timers.forEach((fn) => fn());
  assert.equal(store.getState().toasts.length, 0);
  assert.equal(describeError(undefined), 'Something went wrong. Please try again.');
});

test('notes: loading demo notes ends the session, seeds, resets state and refreshes the dashboard', async () => {
  const { store, notes, calls, endedCount } = setup();
  assert.equal(await notes.loadDemo(), true);
  assert.deepEqual(calls, ['seed', 'dashboard']);
  assert.equal(endedCount(), 1);
  assert.equal(store.getState().dashboard.mastery.length, 1);
  assert.match(store.getState().toasts[0].text, /Demo notes loaded/);
});

test('notes: upload reports how many topics were found', async () => {
  const { store, notes, calls } = setup();
  await notes.uploadFile({ name: 'bio.pdf' });
  assert.deepEqual(calls, ['upload:bio.pdf', 'dashboard']);
  assert.match(store.getState().toasts[0].text, /Found 2 topics in bio\.pdf/);
});

test('notes: a backend failure becomes a banner, never an exception', async () => {
  const { store, notes } = setup({ backendOverrides: { seedDemo: async () => { throw new ApiError('Cannot reach the backend', { code: 'network' }); } } });
  assert.equal(await notes.loadDemo(), false);
  assert.equal(store.getState().banner, 'Cannot reach the backend');
});

test('notes: opening a topic selects it then stores its details', async () => {
  const { store, notes } = setup();
  await notes.openTopic(1);
  assert.equal(store.getState().selectedTopicId, 1);
  assert.equal(store.getState().topicDetail.topic_name, 'Precision');
});

test('session: start passes mode, topic and language to the voice client and resets the session', async () => {
  const { store, session, voice } = setup();
  voice.status = 'listening';                                   // a session is already running
  await session.start('learn', 5);
  assert.equal(voice.stopped, 1);                               // it was ended first
  assert.deepEqual(voice.started, [{ userId: 1, lang: 'hinglish', mode: 'learn', topicId: 5, side: undefined, motion: undefined, style: undefined }]);
  assert.equal(store.getState().session.mode, 'learn');
});

test('session: a debate passes the side Eklavya takes and the motion to the voice client', async () => {
  const { store, session, voice } = setup();
  await session.start('debate', 5, { side: 'against', motion: 'Precision beats recall' });
  assert.deepEqual(voice.started, [{ userId: 1, lang: 'hinglish', mode: 'debate', topicId: 5, side: 'against', motion: 'Precision beats recall', style: undefined }]);
  assert.equal(store.getState().session.mode, 'debate');
});

test('session: a failed start (e.g. mic denied) is shown in the banner', async () => {
  const { store, session, voice } = setup();
  voice.failWith = new Error('Microphone permission was denied.');
  await session.start();
  assert.equal(store.getState().banner, 'Microphone permission was denied.');
});

test('session: server events update the matching state', () => {
  const { store, session } = setup();
  session.handleEvent({ type: 'transcript', role: 'tutor', text: 'Hi', final: false });
  session.handleEvent({ type: 'emotion', topic: 'Precision', confusion: 0.7, confidence: 0.3, frustration: 0 });
  session.handleEvent({ type: 'phase', phase: 'teaching', topic: 'Precision' });
  session.handleEvent({ type: 'quiz_question', question_id: 9, question: 'Q?', options: ['A. x'], topic: 'Precision', number: 1, total: 3 });
  session.handleEvent({ type: 'board', kind: 'steps', title: 'F1', items: ['a'], highlight: 1 });
  session.handleEvent({ type: 'mission', title: 'Fix it', duration_minutes: 15, priority: 'High', reason: 'r', tasks: ['t'] });
  const s = store.getState();
  assert.equal(s.session.messages[0].text, 'Hi');
  assert.equal(s.session.emotion.confusion, 0.7);
  assert.deepEqual(s.session.phase, { phase: 'teaching', topic: 'Precision' });
  assert.equal(s.session.question.question_id, 9);
  assert.deepEqual(s.session.boards, [{ kind: 'steps', title: 'F1', items: ['a'], highlight: 1 }]);   // `type` is dropped
  assert.equal(s.mission.title, 'Fix it');
});

test('session: a graded answer shows a toast and refreshes the dashboard', () => {
  const { store, session, calls } = setup();
  session.handleEvent({ type: 'mastery', topic: 'Precision', before: 38, after: 47.3, is_correct: true, misconception: null });
  assert.equal(store.getState().session.result.after, 47.3);
  assert.equal(store.getState().toasts[0].text, 'Precision: 38% → 47.3%');
  assert.deepEqual(calls, ['dashboard']);
});

test('session: a server error stops the voice session and is shown', () => {
  const { store, session, voice } = setup();
  voice.status = 'listening';
  session.handleEvent({ type: 'error', message: 'Gemini Live failed: quota' });
  assert.equal(voice.stopped, 1);
  assert.equal(store.getState().banner, 'Gemini Live failed: quota');
});

test('session: unknown event types are ignored', () => {
  const { store, session } = setup();
  const before = store.getState();
  session.handleEvent({ type: 'something_from_a_newer_server' });
  assert.equal(store.getState(), before);
});

test('session: toggle starts a free session when idle and stops it when active', async () => {
  const { session, voice } = setup();
  await session.toggle();
  assert.equal(voice.started.length, 1);
  await session.toggle();
  assert.equal(voice.stopped, 1);
});

// ----- API client
function mockFetch(response) {
  globalThis.fetch = async () => (response instanceof Error ? Promise.reject(response) : response);
}
const jsonResponse = (status, body) => ({ ok: status < 400, status, json: async () => body });

test('api client: returns parsed JSON on success', async () => {
  mockFetch(jsonResponse(200, { mastery: [] }));
  assert.deepEqual(await backend.dashboard(1), { mastery: [] });
});

test('api client: backend errors keep their message, code and status', async () => {
  mockFetch(jsonResponse(502, { error: 'Gemini request failed: quota', code: 'llm_unavailable' }));
  await assert.rejects(backend.topic(1, 1), (err) => err instanceof ApiError && err.status === 502 && err.code === 'llm_unavailable' && /quota/.test(err.message));
});

test('api client: validation errors expose the offending fields', async () => {
  mockFetch(jsonResponse(422, { error: 'The request was not valid.', code: 'invalid_request', fields: [{ field: 'x', problem: 'bad' }] }));
  await assert.rejects(backend.dashboard(1), (err) => err.fields[0].field === 'x');
});

test('api client: a network failure says the backend is unreachable', async () => {
  mockFetch(new TypeError('Failed to fetch'));
  await assert.rejects(backend.dashboard(1), (err) => err.code === 'network' && /Cannot reach the backend/.test(err.message));
});

test('api client: a non-JSON reply is reported, not crashed on', async () => {
  mockFetch({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } });
  await assert.rejects(backend.dashboard(1), (err) => err.code === 'bad_response');
  mockFetch({ ok: false, status: 500, json: async () => { throw new SyntaxError('x'); } });
  await assert.rejects(backend.dashboard(1), (err) => err.status === 500 && /Request failed \(500\)/.test(err.message));
});

test('notes: refreshing the dashboard also refreshes the open topic card', async () => {
  let mastery = 38;
  const { store, notes } = setup({ backendOverrides: {
    topic: async (id) => ({ topic_id: id, topic_name: 'Precision', notes: [], open_misconceptions: [], mastery, question_count: 3 }),
  } });
  await notes.openTopic(1);
  assert.equal(store.getState().topicDetail.mastery, 38);
  mastery = 47.3;                                                    // an answer changed it on the server
  await notes.refresh();
  assert.equal(store.getState().topicDetail.mastery, 47.3);
});

test('notes: a failing topic refresh does not turn a successful dashboard refresh into an error', async () => {
  let fail = false;
  const { store, notes } = setup({ backendOverrides: {
    topic: async (id) => { if (fail) throw new Error('boom'); return { topic_id: id, topic_name: 'P', notes: [], open_misconceptions: [], mastery: 38, question_count: 1 }; },
  } });
  await notes.openTopic(1);
  fail = true;
  assert.equal(await notes.refresh(), true);
  assert.equal(store.getState().banner, null);
});

test('notes: removing a document ends the session, deletes it, resets state and reloads the dashboard', async () => {
  const { store, notes, calls, endedCount } = setup();
  await notes.openTopic(1);
  calls.length = 0;
  assert.equal(await notes.removeDocument(7), true);
  assert.deepEqual(calls, ['delete:7', 'dashboard']);
  assert.equal(endedCount(), 1);
  assert.equal(store.getState().selectedTopicId, null);          // the open topic may have belonged to it
  assert.match(store.getState().toasts.at(-1).text, /Notes removed/);
});

test('notes: a failed removal is reported and leaves the state alone', async () => {
  const { store, notes } = setup({ backendOverrides: { deleteDocument: async () => { throw new ApiError('Unknown document', { status: 404, code: 'not_found' }); } } });
  assert.equal(await notes.removeDocument(99), false);
  assert.equal(store.getState().banner, 'Unknown document');
});

test('api client: deleteDocument sends DELETE to the document url', async () => {
  let seen;
  globalThis.fetch = async (url, options) => { seen = { url, method: options.method }; return { ok: true, status: 200, json: async () => ({ deleted: 7 }) }; };
  assert.deepEqual(await backend.deleteDocument(7, 1), { deleted: 7 });
  assert.match(seen.url, /\/api\/documents\/7\?user_id=1$/);
  assert.equal(seen.method, 'DELETE');
});
