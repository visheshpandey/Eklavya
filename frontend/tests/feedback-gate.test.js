import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedbackGate, sessionIsOver } from '../js/lib/feedback-gate.js';
import { initialState } from '../js/state/reducer.js';

function gate(canShow) {
  const opened = [];
  let isOpen = false;
  const g = createFeedbackGate({ done: () => isOpen, canShow, open: () => { isOpen = true; opened.push(1); } });
  return { g, opened };
}

test('the feedback card never opens on an answer, only when the session has ended', () => {
  let over = false;
  const { g, opened } = gate(() => over);
  for (let i = 0; i < 6; i++) g.count();          // answers in the middle of a quiz
  assert.equal(opened.length, 0);
  assert.equal(g.sessionEnded(), false);          // a question is still on screen
  over = true;
  assert.equal(g.sessionEnded(), true);
  assert.equal(opened.length, 1);
  assert.equal(g.sessionEnded(), false);          // once only
});

test('it waits for enough answers', () => {
  const { g, opened } = gate(() => true);
  g.count(); g.count();
  g.sessionEnded();
  assert.equal(opened.length, 0);
});

test('a session is over when the call has ended or the test summary is showing, not while a question is up', () => {
  const live = { ...initialState, voiceStatus: 'listening', session: { ...initialState.session, question: { number: 2, total: 3 }, summary: null } };
  assert.equal(sessionIsOver(live), false);
  assert.equal(sessionIsOver({ ...live, session: { ...live.session, summary: { correct: 2, total: 3 } } }), true);
  assert.equal(sessionIsOver({ ...live, voiceStatus: 'idle' }), true);
});
