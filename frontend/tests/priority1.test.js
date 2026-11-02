// Pure helpers behind Priority 1: sparklines, the demo circle's leaderboard, subjects that have not started.
import test from 'node:test';
import assert from 'node:assert/strict';

import { sparklinePath } from '../js/lib/sparkline.js';
import { leaderboard, weeklyGain } from '../js/components/demo-circle.js';
import { groupSubjects } from '../js/lib/subjects.js';

test('sparklinePath draws oldest to newest, higher mastery higher on the line', () => {
  const path = sparklinePath([20, 60, 100], 72, 22, 2);
  const points = path.split(/[ML]/).filter(Boolean).map((p) => p.trim().split(' ').map(Number));
  assert.equal(points.length, 3);
  assert.ok(points[0][0] < points[1][0] && points[1][0] < points[2][0]);
  assert.ok(points[0][1] > points[1][1] && points[1][1] > points[2][1]);   // y grows downward, mastery grows upward
  assert.equal(sparklinePath([]), '');
});

test('weeklyGain averages latest minus first over topics with at least two points', () => {
  assert.equal(weeklyGain([[30, 40], [50, 70], [60]]), 15);
  assert.equal(weeklyGain([[], [10]]), 0);
});

test('the leaderboard ranks by mastery gained, then mastery, and marks you', () => {
  const friends = [{ name: 'Aarav', gain: 14, mastery: 71, streak: 6 }, { name: 'Riya', gain: 21, mastery: 78, streak: 9 }];
  const rows = leaderboard(friends, 19, 59, 9);
  assert.deepEqual(rows.map((r) => r.name), ['Riya', 'You', 'Aarav']);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
  assert.equal(rows.find((r) => r.you).name, 'You');
});

test('a subject with no started topic has no percentage and is "Not started"', () => {
  const [fresh, begun] = groupSubjects([
    { document_id: 1, document: 'OS Notes', topic_id: 1, mastery_score: 50, started: false, source_kind: 'pdf' },
    { document_id: 2, document: 'ML Notes', topic_id: 2, mastery_score: 38, started: true }, { document_id: 2, document: 'ML Notes', topic_id: 3, mastery_score: 50, started: false },
  ]);
  assert.equal(fresh.mastery, null); assert.equal(fresh.label, 'Not started'); assert.equal(fresh.kind, 'pdf');
  assert.equal(begun.mastery, 38); assert.equal(begun.started, 1); assert.equal(begun.weak, 1);   // the topic not started does not count
});
