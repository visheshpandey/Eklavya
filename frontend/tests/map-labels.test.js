// The concept map: every name is whole (no "…"), horizontal, on at most 2 lines, and nothing overlaps; plural strings agree with their number.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ellipseLayout, hasCollision, mapCanvas, placeLabels, wrapFull } from '../js/lib/map-layout.js';
import { plural } from '../js/lib/format.js';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const TOPICS = ['OS: Processes and Threads', 'OS: CPU Scheduling', 'OS: Deadlocks', 'OS: Paging and Virtual Memory', 'DBMS: Normalisation', 'DBMS: Transactions and ACID',
  'DBMS: Indexing', 'Classification in Machine Learning', 'Precision', 'Recall', 'Machine Learning Notes: Evaluation Metrics'];

function layoutAt(width, topics = TOPICS) {
  const lines = topics.map((t) => wrapFull(t, 2, 14));
  const longest = Math.max(...lines.flat().map((l) => l.length), 10);
  const canvas = mapCanvas(topics.length, width, longest);
  const points = ellipseLayout(topics.length, canvas);
  const placed = placeLabels(points, lines, { W: canvas.W, H: canvas.H, nodeRadius: canvas.nodeRadius });
  return { lines, canvas, points, placed };
}

test('a name is wrapped onto at most two lines and never cut, however long', () => {
  for (const topic of TOPICS) {
    const lines = wrapFull(topic, 2, 14);
    assert.ok(lines.length >= 1 && lines.length <= 2, topic);
    assert.equal(lines.join(' '), topic);                         // every word is there
    assert.ok(!lines.join('').includes('…'));                     // nothing truncated
  }
  assert.deepEqual(wrapFull('Classification in Machine Learning'), ['Classification in', 'Machine Learning']);
  assert.deepEqual(wrapFull('DBMS: Transactions and ACID'), ['DBMS: Transactions', 'and ACID']);
  assert.deepEqual(wrapFull(''), []);
});

test('11 names at 1150px and 1366px wide: horizontal, whole, inside the picture, and no name touches another name or a circle', () => {
  for (const width of [590, 700, 980, 1100]) {   // the card is about 590px wide at a 1150px window and about 980px at 1366px
    const { placed, points, canvas } = layoutAt(width);
    assert.equal(placed.length, TOPICS.length);
    assert.equal(hasCollision(placed, points, canvas.nodeRadius), false, `a name overlaps at ${width}px`);
    placed.forEach((spot, i) => {
      assert.equal(spot.lines.join(' '), TOPICS[i]);                                  // whole
      assert.ok(spot.box.l >= 0 && spot.box.r <= canvas.W, `${TOPICS[i]} runs off the side at ${width}px`);
      assert.ok(spot.box.t >= 0 && spot.box.b <= canvas.H, `${TOPICS[i]} runs off the top or bottom at ${width}px`);
      assert.ok(['start', 'end', 'middle'].includes(spot.anchor));                    // horizontal text, never turned
    });
  }
});

test('the card is tall enough for the names: height grows with the number of topics', () => {
  assert.ok(mapCanvas(11, 980, 24).H >= 560);
  assert.ok(mapCanvas(20, 980, 24).H > mapCanvas(11, 980, 24).H);
  assert.ok(mapCanvas(4, 980, 24).H < mapCanvas(11, 980, 24).H);
});

test('plural strings agree with their number, and no UI string uses "(s)"', () => {
  assert.equal(`${plural(1, 'misconception')} resolved`, '1 misconception resolved');
  assert.equal(`${plural(2, 'misconception')} resolved`, '2 misconceptions resolved');
  assert.equal(`${plural(0, 'misconception')} resolved`, '0 misconceptions resolved');
  const root = fileURLToPath(new URL('../js/', import.meta.url));
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : []));
  for (const file of walk(root)) {
    const bad = readFileSync(file, 'utf8').split('\n').filter((l) => /[a-z]\((s|es)\)/.test(l) && /['"`]/.test(l) && !/\.(some|map|filter|find|reduce|every)\(/.test(l));
    assert.deepEqual(bad, [], `${file} has an "(s)" in a string`);
  }
  assert.ok(readFileSync(join(root, '../index.html'), 'utf8').match(/[a-z]\(s\)/) === null);
});
