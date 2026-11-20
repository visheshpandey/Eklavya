import test from 'node:test';
import assert from 'node:assert/strict';
import { clampQuestion, questionNumber } from '../js/lib/question-count.js';
import { initialState, reducer } from '../js/state/reducer.js';
import { actions } from '../js/state/actions.js';

test('the test counter is answers + 1 and never passes the total', () => {
  assert.equal(questionNumber(0, 3), 1);
  assert.equal(questionNumber(2, 3), 3);
  assert.equal(questionNumber(3, 3), 3);   // never "Question 4 of 3"
  assert.equal(questionNumber(5, 3), 3);
});

test('a question numbered past its total is shown as the last one', () => {
  assert.equal(clampQuestion({ number: 4, total: 3 }).number, 3);
  const free = { number: 7 };                        // a free-talk question has no total: left alone
  assert.equal(clampQuestion(free), free);
  const state = reducer(initialState, actions.questionAsked({ question_id: 9, question: 'Q?', options: [], number: 4, total: 3 }));
  assert.equal(state.session.question.number, 3);
});
