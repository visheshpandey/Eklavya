import test from 'node:test';
import assert from 'node:assert/strict';
import { detailText } from '../js/lib/leaderboard-row.js';

test('the detail line reads "6-day streak, 77% mastery"', () => {
  assert.equal(detailText({ streak: 6, mastery: 77 }), '6-day streak, 77% mastery');
  assert.equal(detailText({ streak: 0, mastery: 0 }), '0-day streak, 0% mastery');
});
