import test from 'node:test';
import assert from 'node:assert/strict';
import { permanentLabelIds, subjectLabelSpot } from '../js/lib/graph-labels.js';

const node = (id, notes, subject, mastery = 50, started = true) => ({ id, notes, subject, mastery, started });

test('the biggest spheres are named, at most six', () => {
  const nodes = Array.from({ length: 11 }, (_, i) => node(i + 1, i + 1, `S${i % 3}`));
  const ids = permanentLabelIds(nodes);
  assert.equal(ids.length, 6);
  assert.equal(ids[0], 11);   // the biggest first
  assert.ok(ids.every((id) => id >= 6));   // never one of the five smallest while bigger ones are free
});

test('names spread over the subjects: at most two per subject', () => {
  const nodes = [node(1, 9, 'OS'), node(2, 8, 'OS'), node(3, 7, 'OS'), node(4, 2, 'DBMS'), node(5, 1, 'ML')];
  const ids = permanentLabelIds(nodes);
  assert.deepEqual(ids.filter((id) => [1, 2, 3].includes(id)), [1, 2]);
  assert.ok(ids.includes(4) && ids.includes(5));
});

test('a tie goes to the weaker started topic, and not-started topics come last', () => {
  const nodes = [node(1, 5, 'A', 90), node(2, 5, 'A', 30), node(3, 5, 'B', 10, false)];
  assert.deepEqual(permanentLabelIds(nodes, { max: 3, perSubject: 5 }), [2, 1, 3]);
});

test('few topics are all named, and nothing is named for an empty map', () => {
  assert.deepEqual(permanentLabelIds([node(1, 1, 'A'), node(2, 1, 'A')], { perSubject: 5 }).sort(), [1, 2]);
  assert.deepEqual(permanentLabelIds([]), []);
});

test('a subject title sits above its highest sphere, centred', () => {
  const spot = subjectLabelSpot([{ x: -10, y: 4, z: 0, r: 8 }, { x: 10, y: 20, z: 6, r: 6 }]);
  assert.equal(spot.x, 0);
  assert.equal(spot.z, 3);
  assert.equal(spot.y, 20 + 6 + 26);
  assert.equal(subjectLabelSpot([]), null);
});

test('the title never lands on a sphere: it is above every sphere top', () => {
  const spheres = [{ x: 0, y: 0, z: 0, r: 14 }, { x: 5, y: 30, z: 0, r: 10 }, { x: -5, y: -20, z: 0, r: 6 }];
  const spot = subjectLabelSpot(spheres);
  assert.ok(spheres.every((s) => spot.y > s.y + s.r));
});
