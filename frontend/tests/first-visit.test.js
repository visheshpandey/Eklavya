import test from 'node:test';
import assert from 'node:assert/strict';
import { TOUR_STEPS, demoLoadedMessage, markTourSeen, pickDemoTopic, shouldAutoTour, tourSeen } from '../js/lib/first-visit.js';

const memory = () => { const data = {}; return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } }; };
const base = { seen: false, needsLogin: false, arrivedByLink: false, onboardingPending: false };

test('the tour starts by itself only for a visitor who has chosen, not seen it, and has nothing else to meet', () => {
  assert.equal(shouldAutoTour(base), true);
  assert.equal(shouldAutoTour({ ...base, seen: true }), false);
  assert.equal(shouldAutoTour({ ...base, needsLogin: true }), false);         // the login dialog comes first, alone
  assert.equal(shouldAutoTour({ ...base, arrivedByLink: true }), false);      // a reminder or a shared link goes straight to its screen
  assert.equal(shouldAutoTour({ ...base, onboardingPending: true }), false);  // a new account has its own first-run dialog
  assert.equal(shouldAutoTour({ ...base, reduceMotion: true }), false);
});

test('seeing the tour is remembered, and blocked storage never nags', () => {
  const storage = memory();
  assert.equal(tourSeen(storage), false);
  markTourSeen(storage);
  assert.equal(tourSeen(storage), true);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(tourSeen(blocked), true);
  assert.doesNotThrow(() => markTourSeen(blocked));
});

test('the demo lands on Precision when it is there, else the first topic, else nothing', () => {
  const topics = [{ topic_id: 1, topic_name: 'Processes' }, { topic_id: 2, topic_name: 'Precision' }];
  assert.equal(pickDemoTopic(topics).topic_id, 2);
  assert.equal(pickDemoTopic([topics[0]]).topic_id, 1);
  assert.equal(pickDemoTopic([]), null);
  assert.equal(pickDemoTopic(undefined), null);
});

test('the toast names the topic and the two ways to start', () => {
  assert.match(demoLoadedMessage('Precision'), /Precision.*Learn.*Test/);
  assert.match(demoLoadedMessage(null), /Demo loaded/);
});

test('the tour has five steps, each with a view, a target and words', () => {
  assert.equal(TOUR_STEPS.length, 5);
  for (const step of TOUR_STEPS) assert.ok(step.view && step.target && step.title && step.text);
  assert.equal(TOUR_STEPS.at(-1).view, 'today');   // it ends where the visitor can act: on Today
});
