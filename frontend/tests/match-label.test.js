import test from 'node:test';
import assert from 'node:assert/strict';
import { matchLabel } from '../js/lib/match-label.js';

test('a strong match says it comes from your notes, in green', () => {
  const label = matchLabel('strong');
  assert.equal(label.text, 'From your notes');
  assert.equal(label.tone, '');
});

test('partial and none are amber and explain themselves', () => {
  for (const key of ['partial', 'none']) {
    const label = matchLabel(key);
    assert.equal(label.tone, ' partial');
    assert.ok(label.tip.length > 30);
  }
  assert.equal(matchLabel('partial').text, 'Partial match');
  assert.equal(matchLabel('none').text, 'Not in your notes');
});

test('an unknown value falls back to partial, never to green', () => {
  assert.equal(matchLabel(undefined).text, 'Partial match');
});
