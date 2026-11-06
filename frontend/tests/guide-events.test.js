import test from 'node:test';
import assert from 'node:assert/strict';
import { testFinished, tutorReplied } from '../js/lib/guide-events.js';

const say = (role, text, extra = {}) => ({ role, text, final: true, ...extra });

test('the mentor counts as having replied only after the student said something', () => {
  assert.equal(tutorReplied([]), false);
  assert.equal(tutorReplied(undefined), false);
  assert.equal(tutorReplied([say('tutor', 'Namaste, kya padhna hai?')]), false);                       // the greeting is not a reply
  assert.equal(tutorReplied([say('user', 'Precision samjhao'), say('tutor', 'Precision matlab ...')]), true);
});

test('the instant local first line and unfinished or empty bubbles do not count', () => {
  assert.equal(tutorReplied([say('user', 'hello'), say('tutor', 'Chaliye, shuru karte hain.', { local: true })]), false);
  assert.equal(tutorReplied([say('user', 'hello'), say('tutor', 'Precision ma', { final: false })]), false);
  assert.equal(tutorReplied([say('user', 'hello'), say('tutor', '   ')]), false);
  assert.equal(tutorReplied([say('user', 'hello', { local: true }), say('tutor', 'Hi')]), false);
});

test('a typed text-mode answer and a spoken one are the same kind of message', () => {
  const typed = [say('tutor', 'Question 1 of 3 ...'), say('user', 'A'), say('tutor', 'Not quite: the formula is TP/(TP+FP).')];
  assert.equal(tutorReplied(typed), true);
});

test('a test counts as finished when its summary exists', () => {
  assert.equal(testFinished(null), false);
  assert.equal(testFinished(undefined), false);
  assert.equal(testFinished({ correct: 2, total: 3 }), true);
});
