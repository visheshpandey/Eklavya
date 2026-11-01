import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarLook } from '../js/lib/avatar-mood.js';

test('a right answer makes the face happy, a wrong one gentle', () => {
  assert.equal(avatarLook({ status: 'speaking', result: { is_correct: true } }).mood, 'happy');
  assert.equal(avatarLook({ status: 'speaking', result: { is_correct: false } }).mood, 'gentle');
});

test('a confused or frustrated student gets a gentle face, a calm one does not', () => {
  assert.equal(avatarLook({ status: 'listening', emotion: { confusion: 0.8, frustration: 0 } }).mood, 'gentle');
  assert.equal(avatarLook({ status: 'listening', emotion: { confusion: 0.1, frustration: 0.7 } }).mood, 'gentle');
  assert.equal(avatarLook({ status: 'listening', emotion: { confusion: 0.2, frustration: 0.1 } }).mood, 'calm');
});

test('connecting looks like thinking; with nothing known the face is calm', () => {
  assert.equal(avatarLook({ status: 'connecting', result: { is_correct: true } }).mood, 'thinking');
  assert.deepEqual(avatarLook(), { mood: 'calm', state: 'idle' });
});

test('the voice status is passed through for the mouth', () => {
  assert.equal(avatarLook({ status: 'speaking' }).state, 'speaking');
});
