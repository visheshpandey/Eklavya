import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_STEPS, allDone, canOpen, doneCount, readGuide, writeGuide } from '../js/components/guide.js';

const memory = () => { const data = {}; return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } }; };
const FRESH = { open: false, min: false, dismissed: false, finished: false, done: {} };

test('the guide has the four things that matter, in order', () => {
  assert.deepEqual(GUIDE_STEPS.map((s) => s.id), ['ask', 'talk', 'test', 'progress']);
});

test('a fresh visitor starts closed with nothing done', () => {
  assert.deepEqual(readGuide(memory()), FRESH);
});

test('ticks, close and finish survive a reload, and the count follows the ticks', () => {
  const storage = memory();
  writeGuide(storage, { open: true, min: false, dismissed: true, finished: false, done: { ask: true, test: true } });
  const back = readGuide(storage);
  assert.equal(back.open, true);
  assert.equal(back.dismissed, true);
  assert.equal(doneCount(back), 2);
  assert.equal(allDone(back), false);
});

test('all four ticked is done', () => {
  assert.equal(allDone({ ...FRESH, done: { ask: true, talk: true, test: true, progress: true } }), true);
});

test('a state saved by an older version (no dismissed flag) still reads', () => {
  const storage = memory();
  storage.setItem('eklavya.guide', JSON.stringify({ open: true, min: true, done: { ask: true } }));
  assert.deepEqual(readGuide(storage), { open: true, min: true, dismissed: false, finished: false, done: { ask: true } });
});

test('a card the student closed does not come back on its own, but the menu brings it back', () => {
  assert.equal(canOpen(FRESH), true);
  assert.equal(canOpen({ ...FRESH, dismissed: true }), false);   // e.g. the demo loading again
  assert.equal(canOpen({ ...FRESH, finished: true }), false);    // it already said goodbye
  assert.equal(canOpen({ ...FRESH, dismissed: true }, { force: true }), true);
  assert.equal(canOpen({ ...FRESH, finished: true }, { force: true }), true);
});

test('broken or blocked storage never throws', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(readGuide(broken), FRESH);
  assert.doesNotThrow(() => writeGuide(broken, { open: true, min: false, done: {} }));
  assert.deepEqual(readGuide({ getItem: () => '{not json', setItem() {} }), FRESH);
});
