import test from 'node:test';
import assert from 'node:assert/strict';
import { ignoreSpokenLine } from '../js/lib/echo-guard.js';

const base = { testOpen: true, speaking: false, msSinceSpeech: 5000, lastTutorText: '' };

test('a "D" heard while the tutor is speaking is ignored', () => {
  assert.equal(ignoreSpokenLine({ ...base, speaking: true, text: 'D' }), true);
});

test('anything heard in the 800 ms after the tutor stops, during a test, is ignored', () => {
  assert.equal(ignoreSpokenLine({ ...base, msSinceSpeech: 300, text: 'seventy five percent' }), true);
  assert.equal(ignoreSpokenLine({ ...base, msSinceSpeech: 900, text: 'seventy five percent' }), false);
});

test('one word within 1.5 s of the tutor is ignored; a sentence is not', () => {
  assert.equal(ignoreSpokenLine({ ...base, testOpen: false, msSinceSpeech: 1200, text: 'D' }), true);
  assert.equal(ignoreSpokenLine({ ...base, testOpen: false, msSinceSpeech: 1600, text: 'D' }), false);
  assert.equal(ignoreSpokenLine({ ...base, testOpen: false, msSinceSpeech: 1200, text: 'mujhe samajh nahi aaya' }), false);
});

test('a line that repeats what the tutor just said is ignored', () => {
  const last = 'Which formula gives precision? Is it A, TP divided by TP plus TN';
  assert.equal(ignoreSpokenLine({ ...base, testOpen: false, text: 'which formula gives precision', lastTutorText: last }), true);
  assert.equal(ignoreSpokenLine({ ...base, testOpen: false, text: 'I think it is the second one', lastTutorText: last }), false);
});
