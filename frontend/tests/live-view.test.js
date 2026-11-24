import test from 'node:test';
import assert from 'node:assert/strict';
import { totalRows, barHeights, ago, feedItems } from '../js/lib/live-view.js';

test('totals come in a fixed order and a missing number is 0', () => {
  const rows = totalRows({ students: 4, questions: 9 });
  assert.deepEqual(rows[0], ['Students', 4]);
  assert.deepEqual(rows.find(([label]) => label === 'Questions asked'), ['Questions asked', 9]);
  assert.deepEqual(rows.find(([label]) => label === 'Study groups'), ['Study groups', 0]);
});

test('bars scale to the busiest minute and a quiet minute stays empty', () => {
  assert.deepEqual(barHeights([0, 5, 10]), [0, 50, 100]);
  assert.deepEqual(barHeights([0, 0]), [0, 0]);
  assert.equal(barHeights([1, 100])[0], 8);   // a single action is still visible
});

test('ago words', () => {
  const now = 1_000_000_000;
  assert.equal(ago(now - 2000, now), 'just now');
  assert.equal(ago(now - 42_000, now), '42s ago');
  assert.equal(ago(now - 5 * 60_000, now), '5 min ago');
  assert.equal(ago(now - 2 * 3_600_000, now), '2 h ago');
  assert.equal(ago(now + 9000, now), 'just now');   // a clock a little ahead never shows a negative time
});

test('feed items use the server clock', () => {
  const now = Date.parse('2026-11-24T12:00:30Z');
  const [item] = feedItems([{ at: '2026-11-24 12:00:00', kind: 'ask', who: 'Student #3', what: 'asked a question about Joins' }], now);
  assert.deepEqual(item, { kind: 'ask', who: 'Student #3', what: 'asked a question about Joins', when: '30s ago' });
});
