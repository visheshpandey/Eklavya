import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnswerGuard } from '../js/lib/answer-guard.js';

const clock = () => { let t = 1000; return { now: () => t, tick: (ms) => { t += ms; } }; };

test('an option click 300 ms after a question appears is ignored; after 700 ms it counts', () => {
  const c = clock(); const guard = createAnswerGuard({ now: c.now });
  const q2 = { n: 2 }; guard.arm(q2);
  c.tick(300); assert.equal(guard.allows(q2), false);
  c.tick(400); assert.equal(guard.allows(q2), true);
});

test('Q2 to Q3: the new question starts closed again, and a click made for Q2 never answers Q3', () => {
  const c = clock(); const guard = createAnswerGuard({ now: c.now });
  const q2 = { n: 2 }, q3 = { n: 3 };
  guard.arm(q2); c.tick(5000); assert.equal(guard.allows(q2), true);
  guard.arm(q3); c.tick(300);
  assert.equal(guard.allows(q3), false);   // the Next question click landing on option D
  assert.equal(guard.allows(q2), false);   // a stale button of the old question
  c.tick(500); assert.equal(guard.allows(q3), true);
});

test('nothing is allowed before any question is armed', () => {
  assert.equal(createAnswerGuard().allows({}), false);
});
