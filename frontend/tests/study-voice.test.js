// The Study room's honest voice states, the first line, captions and the text-mode state (workstream: judge readiness).
import test from 'node:test';
import assert from 'node:assert/strict';
import { actions } from '../js/state/actions.js';
import { initialState, reducer } from '../js/state/reducer.js';
import { selectTextInputEnabled } from '../js/state/selectors.js';
import { firstLine, isConnecting, statusKey } from '../js/lib/voice-phase.js';
import { loadCaptions, saveCaptions } from '../js/lib/captions.js';
import { SESSION_MODE, VOICE_STATUS } from '../js/lib/protocol.js';
import { t } from '../js/lib/strings.js';

const run = (...list) => list.reduce(reducer, initialState);
const memory = () => { const d = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = String(v); } }; };

test('a call that is open but not ready still says "connecting", never "listening"', () => {
  assert.equal(statusKey({ status: VOICE_STATUS.IDLE }), 'stage.idle');
  assert.equal(statusKey({ status: VOICE_STATUS.CONNECTING, live: { ready: false } }), 'stage.connecting');
  assert.equal(statusKey({ status: VOICE_STATUS.LISTENING, live: { ready: false } }), 'stage.connecting');   // the socket is open, Gemini is not up yet
  assert.equal(statusKey({ status: VOICE_STATUS.LISTENING, live: { ready: true } }), 'stage.yourTurn');
  assert.equal(statusKey({ status: VOICE_STATUS.SPEAKING, live: { ready: true } }), 'stage.speaking');
  assert.equal(statusKey({ status: VOICE_STATUS.LISTENING, live: { ready: false, text: true } }), 'stage.text');
  assert.equal(isConnecting({ status: VOICE_STATUS.LISTENING, live: { ready: false } }), true);
  assert.equal(isConnecting({ status: VOICE_STATUS.LISTENING, live: { ready: true } }), false);
  assert.equal(isConnecting({ status: VOICE_STATUS.IDLE }), false);
  assert.equal(isConnecting({ status: VOICE_STATUS.LISTENING, live: { ready: false, text: true } }), false);
});

test('the status words are the ones the brief asks for, in English and Hindi', () => {
  assert.equal(t('stage.connecting', 'english'), 'Connecting to Eklavya…');
  assert.equal(t('stage.speaking', 'english'), 'Eklavya is speaking');
  assert.equal(t('stage.yourTurn', 'english'), 'Your turn: speak or type');
  assert.ok(t('stage.yourTurn', 'hindi') && !t('stage.yourTurn', 'hindi').startsWith('stage.'));
  assert.ok(t('stage.text', 'hindi') && !t('stage.text', 'hindi').startsWith('stage.'));
});

test('the first line is shown at once, in the chosen language, for each mode', () => {
  assert.equal(firstLine({ mode: SESSION_MODE.TEST, language: 'hinglish', topic: 'Precision' }), 'Chaliye, shuru karte hain aapka test on Precision.');
  assert.equal(firstLine({ mode: SESSION_MODE.TEST, language: 'english', topic: 'Precision' }), "Let's begin your test on Precision.");
  assert.match(firstLine({ mode: SESSION_MODE.TEST, language: 'hindi', topic: 'Precision' }), /Precision/);
  assert.match(firstLine({ mode: SESSION_MODE.LEARN, language: 'english', topic: 'Recall' }), /Recall/);
  assert.match(firstLine({ mode: SESSION_MODE.FREE, language: 'english' }), /What would you like/);
  assert.match(firstLine({ mode: SESSION_MODE.REVISE, language: 'hinglish' }), /this topic/);   // no topic name known: a plain phrase, never "undefined"
  for (const mode of Object.values(SESSION_MODE)) for (const language of ['hinglish', 'english', 'hindi']) assert.ok(firstLine({ mode, language, topic: 'X' }).length > 5);
});

test('captions are on by default, and the choice is remembered without ever throwing', () => {
  assert.equal(initialState.ui.captions, true);
  const storage = memory();
  assert.equal(loadCaptions(storage), true);
  saveCaptions(false, storage);
  assert.equal(loadCaptions(storage), false);
  saveCaptions(true, storage);
  assert.equal(loadCaptions(storage), true);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(loadCaptions(blocked), true);
  assert.doesNotThrow(() => saveCaptions(false, blocked));
});

test('the local first line stands in until Eklavya\'s own words arrive, then it goes (the greeting is never said twice)', () => {
  let s = run(actions.sessionStarted({ mode: 'test', topicId: 1 }), actions.transcriptReceived({ role: 'tutor', text: 'Local line.', final: true, local: true }));
  assert.deepEqual(s.session.messages.map((m) => m.text), ['Local line.']);
  s = reducer(s, actions.transcriptReceived({ role: 'tutor', text: 'Hello, real', final: false, replace: true }));
  assert.deepEqual(s.session.messages.map((m) => m.text), ['Hello, real']);
  assert.equal(s.session.messages[0].local, undefined);
  s = reducer(s, actions.transcriptReceived({ role: 'tutor', text: 'Hello, real greeting.', final: true }));
  assert.deepEqual(s.session.messages.map((m) => m.text), ['Hello, real greeting.']);
});

test('the local line stays if only the student has spoken so far', () => {
  let s = run(actions.sessionStarted({ mode: 'free', topicId: null }), actions.transcriptReceived({ role: 'tutor', text: 'Local line.', final: true, local: true }),
    actions.transcriptReceived({ role: 'user', text: 'hello', final: true }));
  assert.deepEqual(s.session.messages.map((m) => [m.role, m.text]), [['tutor', 'Local line.'], ['user', 'hello']]);
});

test('the call becomes ready once, and a new session starts not ready', () => {
  let s = run(actions.sessionStarted({ mode: 'free', topicId: null }));
  assert.equal(s.session.live.ready, false);
  s = reducer(s, actions.liveReady());
  assert.equal(s.session.live.ready, true);
  assert.equal(reducer(s, actions.liveReady()), s);
  s = reducer(s, actions.sessionStarted({ mode: 'free', topicId: null }));
  assert.equal(s.session.live.ready, false);
});

test('text mode lets the student type even though no voice is running, and keeps the quiz on screen', () => {
  let s = run(actions.sessionStarted({ mode: 'test', topicId: 1 }), actions.voiceStatusChanged(VOICE_STATUS.LISTENING),
    actions.questionAsked({ question_id: 4, question: 'Q?', options: ['A. x'], topic: 'P', number: 1, total: 3 }));
  s = reducer(s, actions.textModeStarted());
  assert.equal(s.session.live.text, true);
  assert.equal(s.session.question.question_id, 4);
  assert.equal(selectTextInputEnabled(s), true);
  assert.equal(selectTextInputEnabled({ ...s, voiceStatus: VOICE_STATUS.IDLE }), false);   // ended: nothing to type into
});
