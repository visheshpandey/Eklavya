import test from 'node:test';
import assert from 'node:assert/strict';
import { createShortcutGuard, flashcardKey, isPrintable } from '../js/lib/shortcut-guard.js';

function harness() {
  let clock = 0;
  const timers = new Map();
  let nextId = 1;
  const guard = createShortcutGuard({
    now: () => clock,
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: clock + ms }); return id; },
    clearTimer: (id) => timers.delete(id),
  });
  const fired = [];
  const advance = (ms) => {
    clock += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); }
  };
  const key = (k, extra = {}, ctx = {}) => guard.press({ key: k, ...extra }, { editable: false, dialogOpen: false, run: () => fired.push(k), ...ctx });
  return { guard, fired, advance, key };
}

test('a single deliberate key press runs its shortcut after a short settle time', () => {
  const { fired, advance, key } = harness();
  assert.equal(key('t'), 'scheduled');
  assert.deepEqual(fired, []);
  advance(300);
  assert.deepEqual(fired, ['t']);
});

test('typing a sentence outside a field fires nothing, not even the first letter', () => {
  const { fired, advance, key } = harness();
  for (const letter of 'Mujhe precision samjhao') { key(letter); advance(80); }
  advance(2000);
  assert.deepEqual(fired, []);
});

test('a key pressed soon after a burst of typing is ignored, and works again after 1.5 s of quiet', () => {
  const { fired, advance, key } = harness();
  key('a'); advance(100); key('b'); advance(1000);
  assert.equal(key('q'), 'ignored');
  advance(2000);
  assert.deepEqual(fired, []);
  advance(1600);
  assert.equal(key('q'), 'scheduled');
  advance(300);
  assert.deepEqual(fired, ['q']);
});

test('nothing fires from a field, a dialog, Ctrl/Meta/Alt or while composing', () => {
  const { fired, advance, key } = harness();
  assert.equal(key('t', {}, { editable: true }), 'ignored');
  assert.equal(key('t', {}, { dialogOpen: true }), 'ignored');
  assert.equal(key('t', { ctrlKey: true }), 'ignored');
  assert.equal(key('t', { metaKey: true }), 'ignored');
  assert.equal(key('t', { altKey: true }), 'ignored');
  assert.equal(key('t', { isComposing: true }), 'ignored');
  advance(5000);
  assert.deepEqual(fired, []);
});

test('typing into a field cancels a shortcut that was waiting', () => {
  const { fired, advance, key } = harness();
  key('m');
  advance(100);
  key('x', {}, { editable: true });
  advance(1000);
  assert.deepEqual(fired, []);
});

test('letters that are not shortcuts still count as typing', () => {
  const { guard, fired, advance, key } = harness();
  guard.note({ key: 'x' });
  advance(200);
  assert.equal(key('t'), 'ignored');
  advance(5000);
  assert.deepEqual(fired, []);
  guard.note({ key: 'y' }, { editable: true });   // typing inside a field does not count as outside typing
  assert.equal(key('t'), 'scheduled');
});

test('only characters count as typing', () => {
  assert.equal(isPrintable({ key: 'a' }), true);
  assert.equal(isPrintable({ key: 'Enter' }), false);
  assert.equal(isPrintable({ key: 'ArrowDown' }), false);
  assert.equal(isPrintable({ key: 'a', ctrlKey: true }), false);
});

const onCards = { view: 'flashcards', editable: false, dialogOpen: false, flipped: true, summary: false };

test('on the Flashcards page Space flips and 1, 2, 3 rate Again, Hard, Got it', () => {
  assert.equal(flashcardKey({ key: ' ' }, { ...onCards, flipped: false }), 'flip');
  assert.equal(flashcardKey({ key: '1' }, onCards), 'again');
  assert.equal(flashcardKey({ key: '2' }, onCards), 'hard');
  assert.equal(flashcardKey({ key: '3' }, onCards), 'known');
});

test('a rating key does nothing until the card is flipped, or when the round is over', () => {
  assert.equal(flashcardKey({ key: '3' }, { ...onCards, flipped: false }), null);
  assert.equal(flashcardKey({ key: '3' }, { ...onCards, summary: true }), null);
  assert.equal(flashcardKey({ key: '4' }, onCards), null);
});

test('flashcard keys do nothing on other pages, in a field, in a dialog, with a modifier or while composing', () => {
  assert.equal(flashcardKey({ key: ' ' }, { ...onCards, view: 'study' }), null);
  assert.equal(flashcardKey({ key: '1' }, { ...onCards, view: 'ask' }), null);
  assert.equal(flashcardKey({ key: ' ' }, { ...onCards, editable: true }), null);
  assert.equal(flashcardKey({ key: '1' }, { ...onCards, dialogOpen: true }), null);
  assert.equal(flashcardKey({ key: ' ', ctrlKey: true }, onCards), null);
  assert.equal(flashcardKey({ key: '1', metaKey: true }, onCards), null);
  assert.equal(flashcardKey({ key: '1', altKey: true }, onCards), null);
  assert.equal(flashcardKey({ key: ' ', isComposing: true }, onCards), null);
});
