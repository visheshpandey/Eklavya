import test from 'node:test';
import assert from 'node:assert/strict';
import { describeUsage } from '../js/lib/behind-scenes.js';

test('with nothing yet it says so, and invents no numbers', () => {
  const rows = describeUsage({ ask: { answered: 0, average_ms: null, recent_ms: [], fallbacks: 0 }, gemini: { gemini_calls: 0, gemini_failed: 0, ask_fallbacks: 0 }, decisions: [] });
  assert.deepEqual(rows.map((r) => r.value), ['0', '0', '0']);
  assert.match(rows[0].note, /Ask something/);
  assert.match(rows[1].note, /None since the server last started/);
});

test('real numbers are described as reported', () => {
  const rows = describeUsage({ ask: { answered: 12, average_ms: 8400, recent_ms: [8000, 8800], fallbacks: 1 }, gemini: { gemini_calls: 30, gemini_failed: 2, ask_fallbacks: 1 }, decisions: [] });
  assert.equal(rows[0].value, '12');
  assert.match(rows[0].note, /average 8\.4 s over the last 2, 1 answered from your notes/);
  assert.match(rows[1].note, /2 failed, since the server last started/);
});

test('a missing report does not throw', () => {
  assert.equal(describeUsage(null).length, 3);
});
