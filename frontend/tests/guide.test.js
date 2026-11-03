import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_STEPS, doneCount, readGuide, writeGuide } from '../js/components/guide.js';

const memory = () => { const data = {}; return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } }; };

test('the guide has the four things that matter, in order', () => {
  assert.deepEqual(GUIDE_STEPS.map((s) => s.id), ['ask', 'talk', 'cards', 'progress']);
});

test('a fresh visitor starts closed with nothing done', () => {
  assert.deepEqual(readGuide(memory()), { open: false, min: false, done: {} });
});

test('ticks survive a reload, and the count follows them', () => {
  const storage = memory();
  writeGuide(storage, { open: true, min: false, done: { ask: true, cards: true } });
  const back = readGuide(storage);
  assert.equal(back.open, true);
  assert.equal(doneCount(back), 2);
});

test('broken or blocked storage never throws', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(readGuide(broken), { open: false, min: false, done: {} });
  assert.doesNotThrow(() => writeGuide(broken, { open: true, min: false, done: {} }));
  assert.deepEqual(readGuide({ getItem: () => '{not json', setItem() {} }), { open: false, min: false, done: {} });
});
