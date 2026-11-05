import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeProgressText, plainCount, MASTERY_HELP, BOXES_HELP } from '../js/lib/progress-text.js';

const exam = { id: 'mock-80', description: 'Score 80% or more in a mock exam', goal: 80 };

test('the exam badge says "not yet" instead of "(0 of 80)"', () => {
  const text = badgeProgressText({ ...exam, progress: 0, earned: false });
  assert.match(text, /not yet/);
  assert.doesNotMatch(text, /of 80\)/);
});

test('the exam badge shows the best score as a percentage', () => {
  assert.match(badgeProgressText({ ...exam, progress: 55, earned: false }), /best score 55% of 80%/);
});

test('other badges keep "3 of 7" and an earned badge says Earned', () => {
  assert.equal(badgeProgressText({ id: 'streak-7', description: 'Study 7 days in a row', progress: 3, goal: 7, earned: false }), 'Study 7 days in a row (3 of 7)');
  assert.equal(badgeProgressText({ ...exam, progress: 80, earned: true }), 'Earned');
});

test('counts are plain numbers with no zero padding', () => {
  assert.deepEqual([0, 1, 4, 12, '3', null, undefined, -2].map(plainCount), ['0', '1', '4', '12', '3', '0', '0', '0']);
});

test('the help texts say what the numbers mean', () => {
  assert.match(MASTERY_HELP, /forgetting curve/);
  assert.match(BOXES_HELP, /move right/);
});
