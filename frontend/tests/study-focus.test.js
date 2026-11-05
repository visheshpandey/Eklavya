// The Study room keeps what matters in view: compact while something is on screen, scrolled to whatever just appeared, and a mastery number that counts up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { focusTargetFor, isWorking } from '../js/lib/study-focus.js';
import { countUp, easeOut, percentText, valueAt } from '../js/lib/count-up.js';

test('the room is "at work" only while a call is running and there is something to look at', () => {
  assert.equal(isWorking({ active: false, question: { question_id: 1 } }), false);
  assert.equal(isWorking({ active: true }), false);
  assert.equal(isWorking({ active: true, question: { question_id: 1 } }), true);
  assert.equal(isWorking({ active: true, boards: [{ title: 'F1' }] }), true);
  assert.equal(isWorking({ active: true, summary: { total: 3 } }), true);
  assert.equal(isWorking({ active: true, viva: { question: 'Q' } }), true);
  assert.equal(isWorking({ active: true, viva: { question: null, report: { mark: 3 } } }), true);
  assert.equal(isWorking({ active: true, debateScores: [{ s: 1 }] }), true);
  assert.equal(isWorking({ active: true, verdict: { winner: 'student' } }), true);
});

test('whatever just appeared is what gets scrolled into view, the most specific first', () => {
  const none = { question: null, result: null, summary: null, boardIndex: -1, viva: null, verdict: null, debateScore: null };
  const q = { question_id: 1 }, r = { question_id: 1 }, s = { total: 3 };
  assert.equal(focusTargetFor(none, { ...none, question: q }), '#quizcard');
  assert.equal(focusTargetFor({ ...none, question: q }, { ...none, question: q, result: r }), '#quizcard .result');
  assert.equal(focusTargetFor({ ...none, question: q, result: r }, { ...none, question: q, result: r, summary: s }), '#summary');
  assert.equal(focusTargetFor(none, { ...none, boardIndex: 0 }), '#board');
  assert.equal(focusTargetFor({ ...none, boardIndex: 0 }, { ...none, boardIndex: 0 }), null);      // nothing changed
  assert.equal(focusTargetFor({ ...none, question: q }, { ...none, question: null }), null);       // a question going away needs no scroll
  assert.equal(focusTargetFor(none, { ...none, viva: { question: 'Q' } }), '#viva');
});

test('the mastery number eases from the old value to the new one', () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.ok(easeOut(0.5) > 0.5);                                   // fast at first
  assert.equal(valueAt(38, 47.3, 0, 700), 38);
  assert.equal(valueAt(38, 47.3, 700, 700), 47.3);
  assert.ok(valueAt(38, 47.3, 350, 700) > 42.65 && valueAt(38, 47.3, 350, 700) < 47.3);
  assert.equal(percentText(47.30000001), '47.3%');
});

test('count-up runs frame by frame and lands exactly on the final value; reduce motion jumps straight there', () => {
  let time = 0; let pending = null;
  const seen = [];
  countUp({ from: 38, to: 47.3, ms: 700, onUpdate: (v) => seen.push(v), frame: (fn) => { pending = fn; }, now: () => time });
  assert.equal(seen[0], 38);
  while (pending) { const fn = pending; pending = null; time += 100; fn(); }
  assert.equal(seen.at(-1), 47.3);
  assert.ok(seen.length > 3);
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b));         // only ever goes up
  const jumped = [];
  countUp({ from: 38, to: 47.3, onUpdate: (v) => jumped.push(v), reduce: true });
  assert.deepEqual(jumped, [47.3]);
  const same = [];
  countUp({ from: 5, to: 5, onUpdate: (v) => same.push(v), frame: () => { throw new Error('no frames needed'); } });
  assert.deepEqual(same, [5]);
});

test('count-up can be stopped, and then it stops updating', () => {
  let time = 0; let pending = null; const seen = [];
  const stop = countUp({ from: 0, to: 10, ms: 700, onUpdate: (v) => seen.push(v), frame: (fn) => { pending = fn; }, now: () => time });
  time = 100; pending(); const before = seen.length; stop();
  time = 200; pending?.();
  assert.equal(seen.length, before);
});
