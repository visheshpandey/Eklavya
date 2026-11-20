import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadsFor } from '../js/lib/screen-loads.js';

test('opening the app on Today fetches none of the other screens\' data', () => {
  assert.deepEqual(loadsFor('today'), []);
  assert.deepEqual(loadsFor('progress'), ['badges', 'mockExams']);
  assert.deepEqual(loadsFor('groups'), ['groups', 'challenges', 'demoCircle']);
});

test('badges, mock exams, groups, challenges and the demo circle do not fetch when they are mounted', () => {
  for (const file of ['badges-view', 'mock-exam', 'groups-view', 'challenge-view', 'demo-circle']) {
    const source = readFileSync(new URL(`../js/components/${file}.js`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /^\s*(refresh|load)\(\);\s*$/m, `${file} fetches at mount`);
  }
});

test('the feedback summary under "Why Eklavya" waits until the fold is opened', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /mountImpact\(\{ root: byId\('impactBody'\), loadSummary: \(\) => backend\.feedbackSummary\(\), fold: byId\('impact'\) \}\)/);
});
