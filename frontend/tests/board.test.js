// Whiteboard: formula parsing and the board list in the state.
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseFormula, stripOuterParens } from '../js/lib/formula.js';
import { initialState, reducer, MAX_BOARDS } from '../js/state/reducer.js';
import { actions } from '../js/state/actions.js';

const run = (...acts) => acts.reduce((state, action) => reducer(state, action), initialState);
const steps = (title, highlight) => ({ kind: 'steps', title, items: ['a', 'b', 'c'], highlight });

test('a formula becomes a left side and a stacked fraction without the outer brackets', () => {
  assert.deepEqual(parseFormula('Precision = TP / (TP + FP)'), [{ text: 'Precision' }, { num: 'TP', den: 'TP + FP' }]);
});

test('a worked example keeps every side, and plain numbers stay plain', () => {
  assert.deepEqual(parseFormula('8 / (8 + 2) = 0.8'), [{ num: '8', den: '8 + 2' }, { text: '0.8' }]);
});

test('a slash inside brackets or with a missing side is not a fraction', () => {
  assert.deepEqual(parseFormula('F1 = 2 x (P x R) / (P + R)'), [{ text: 'F1' }, { num: '2 x (P x R)', den: 'P + R' }]);
  assert.deepEqual(parseFormula('rate = (a / b)'), [{ text: 'rate' }, { text: '(a / b)' }]);
  assert.deepEqual(parseFormula('x = a / '), [{ text: 'x' }, { text: 'a /' }]);
  assert.deepEqual(parseFormula(''), []);
});

test('only brackets that wrap the whole text are removed', () => {
  assert.equal(stripOuterParens('(a + b)'), 'a + b');
  assert.equal(stripOuterParens('(a) + (b)'), '(a) + (b)');
});

test('each new board goes on screen; the same title again updates it in place', () => {
  let state = run(actions.sessionStarted({ mode: 'learn', topicId: 1 }), actions.boardShown(steps('F1', 1)), actions.boardShown({ kind: 'formula', title: 'Precision', formula: 'P = a / b', items: [], result: '' }));
  assert.equal(state.session.boards.length, 2);
  assert.equal(state.session.boardIndex, 1);
  state = reducer(state, actions.boardShown({ kind: 'formula', title: 'Precision', formula: 'P = a / b', items: [], result: '8 / 10 = 0.8' }));
  assert.equal(state.session.boards.length, 2);
  assert.equal(state.session.boards[1].result, '8 / 10 = 0.8');
});

test('an earlier board can be picked again; bad indexes are ignored', () => {
  let state = run(actions.boardShown(steps('One', 0)), actions.boardShown(steps('Two', 0)), actions.boardPicked(0));
  assert.equal(state.session.boardIndex, 0);
  assert.equal(reducer(state, actions.boardPicked(7)), state);
  state = reducer(state, actions.boardShown(steps('Three', 0)));
  assert.equal(state.session.boardIndex, 2);   // a new board always comes to the front
});

test('the board list is capped, and a new session starts with a clean board', () => {
  let state = initialState;
  for (let i = 0; i < MAX_BOARDS + 5; i++) state = reducer(state, actions.boardShown(steps(`B${i}`, 0)));
  assert.equal(state.session.boards.length, MAX_BOARDS);
  assert.equal(state.session.boards[0].title, 'B5');
  state = reducer(state, actions.voiceStatusChanged('connecting'));
  state = reducer(state, actions.voiceStatusChanged('idle'));
  assert.equal(state.session.boards.length, MAX_BOARDS);   // still there to review after the call ends
  state = reducer(state, actions.sessionStarted({ mode: 'free', topicId: null }));
  assert.deepEqual([state.session.boards, state.session.boardIndex], [[], -1]);
});
