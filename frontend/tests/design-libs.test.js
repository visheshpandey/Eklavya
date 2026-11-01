// The small pure helpers behind the new screens: greeting, route, orbit, highlighting, subjects, sound.
import test from 'node:test';
import assert from 'node:assert/strict';

import { dateLine, dayPart, firstName, greetingFor, greetingKey, initialOf } from '../js/lib/greeting.js';
import { buildRoute, loadRouteDone, routeProgress, saveRouteDone } from '../js/lib/route.js';
import { frontIndex, orbitPositions, orbitTag, turnBy } from '../js/lib/orbit.js';
import { bestSentences, splitByTerms } from '../js/lib/highlight.js';
import { coverLetters, groupSubjects, masteryStatus } from '../js/lib/subjects.js';
import { createSound, loadSound, saveSound } from '../js/lib/sound.js';

const at = (hour) => new Date(2026, 10, 2, hour, 0, 0);

test('the greeting follows the hour, and the date line is the shouting mono label', () => {
  assert.deepEqual([2, 8, 13, 19].map((h) => greetingFor(at(h))), ['Up late', 'Good morning', 'Good afternoon', 'Good evening']);
  // the boundaries: 1 AM is not morning, 4:59 is still late, 5:00 is morning, noon is afternoon, 5 PM is evening
  assert.deepEqual([0, 1, 4, 5, 11, 12, 16, 17, 23].map(dayPart), ['late', 'late', 'late', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening']);
  assert.equal(greetingKey(at(1)), 'today.late');
  assert.match(dateLine(at(9)), /^MONDAY, NOVEMBER 02 · A LITTLE PROGRESS ADDS UP$/);
  assert.deepEqual([initialOf('asha'), initialOf(''), initialOf(null), firstName('Asha Rao'), firstName('')], ['A', 'E', 'E', 'Asha', '']);
});

test('the route takes its steps from the real plan and falls back to due and weak topics', () => {
  const plan = [{ kind: 'revise', topic_id: 4, topic: 'Recall', minutes: 5 }, { kind: 'learn', topic_id: 9, topic: 'Gradient descent', minutes: 15 }];
  const [recall, concept, cards] = buildRoute({ plan, cardsDue: 8 });
  assert.deepEqual([recall.action, concept.action, cards.sub, cards.minutes],
    [{ type: 'session', mode: 'revise', topicId: 4 }, { type: 'session', mode: 'learn', topicId: 9 }, '8 cards due today', 4]);
  assert.equal(buildRoute({ cardsDue: 67 })[2].minutes, 10);                      // a big deck is still a ten-minute step
  const fallback = buildRoute({ due: [{ topic_id: 2, topic: 'Precision' }], mastery: [{ topic_id: 7, topic_name: 'F1', mastery_score: 20 }, { topic_id: 8, topic_name: 'Recall', mastery_score: 70 }] });
  assert.equal(fallback[0].action.topicId, 2);
  assert.equal(fallback[1].action.topicId, 7);                                    // the weakest topic becomes "understand a concept"
  const empty = buildRoute({});
  assert.deepEqual([empty[0].action, empty[1].action, empty[2].sub], [null, null, 'No cards due']);
});

test('route progress counts finished steps and names the first open one; a new day starts empty', () => {
  assert.deepEqual(routeProgress({}), { done: 0, percent: 0, label: '0 of 3 steps done', current: 'recall' });
  assert.deepEqual(routeProgress({ recall: true, concept: true }), { done: 2, percent: 67, label: '2 of 3 steps done', current: 'cards' });
  assert.equal(routeProgress({ recall: true, concept: true, cards: true }).label, 'All 3 steps done. Nice work.');
  const memory = new Map();
  const storage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  saveRouteDone(storage, '2026-11-02', { recall: true });
  assert.deepEqual(loadRouteDone(storage, '2026-11-02'), { recall: true, concept: false, cards: false });
  assert.deepEqual(loadRouteDone(storage, '2026-11-03'), {});
  assert.deepEqual(loadRouteDone({ getItem() { throw new Error('blocked'); } }, 'x'), {});
});

test('the orbit spreads topics evenly, hides the ones behind and turns one step per arrow key', () => {
  const ring = orbitPositions(5, 0);
  assert.equal(ring.length, 5);
  assert.equal(ring[0].back, false);
  assert.ok(ring.filter((p) => p.back).length >= 2);
  assert.ok(ring.every((p) => (p.back ? p.opacity === 0 : p.opacity > 0.4)));
  assert.equal(frontIndex(5, 0), 0);
  assert.equal(frontIndex(5, -72), 1);                                             // turning the ring brings the next topic to the front
  assert.equal(frontIndex(0, 0), -1);
  assert.deepEqual([turnBy(5, 'ArrowLeft'), turnBy(5, 'ArrowRight'), turnBy(5, 'x')], [72, -72, 0]);
  assert.deepEqual([orbitTag(30, true), orbitTag(50, false), orbitTag(90, false), orbitTag(70, false)], ['Start here', 'Revisit', 'Strong', 'Growing']);
});

test('question words are highlighted with their endings, and a long passage shows its best sentences', () => {
  assert.deepEqual(splitByTerms('Gradient descent moves the gradients.', ['gradient']), [
    { text: 'Gradient', hit: true }, { text: ' descent moves the ', hit: false }, { text: 'gradients', hit: true }, { text: '.', hit: false }]);
  assert.deepEqual(splitByTerms('Nothing here', []), [{ text: 'Nothing here', hit: false }]);
  assert.doesNotThrow(() => splitByTerms('a.b (c) [d]', ['a.b', '(c)', '[d]']));    // regex characters in a term are safe
  const text = 'First sentence is filler. The learning rate sets the step size. Another filler line. The rate can be too large.';
  assert.equal(bestSentences(text, ['learning', 'rate'], 2), 'The learning rate sets the step size. The rate can be too large.');
  assert.equal(bestSentences('Short one.', ['x'], 3), 'Short one.');
});

test('subjects group the topics by document with an average and three paper tones', () => {
  const rows = [
    { document_id: 2, document: 'Neural Networks.pdf', topic_id: 5, mastery_score: 30 }, { document_id: 2, document: 'Neural Networks.pdf', topic_id: 6, mastery_score: 50 },
    { document_id: 1, document: 'ml.txt', topic_id: 1, mastery_score: 90 }, { document_id: 1, document: 'ml.txt', topic_id: 2, mastery_score: 80 }];
  const [nn, ml] = groupSubjects(rows);
  assert.deepEqual([nn.name, nn.mastery, nn.weak, nn.weakestTopicId, nn.tone, nn.label], ['Neural Networks', 40, 2, 5, 'c', 'Needs a look']);
  assert.deepEqual([ml.mastery, ml.tone, ml.label], [85, 'b', 'Feeling good']);
  assert.deepEqual([masteryStatus(59).key, masteryStatus(60).key, masteryStatus(80).key], ['low', 'grow', 'strong']);
  assert.deepEqual([coverLetters('Introduction to ML'), coverLetters('')], ['IN', '··']);
});

test('sound: off means silence, on makes a page turn, the choice is remembered and a blocked store does not break it', () => {
  const made = [];
  class FakeCtx {
    constructor() { made.push(this); this.sampleRate = 8000; this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
    createBufferSource() { return { connect: (n) => n, start() { this.started = true; } }; }
    createBiquadFilter() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: {}, connect: (n) => n }; }
    createGain() { return { gain: {}, connect: (n) => n }; }
  }
  const spoken = [];
  const audio = { AudioContext: FakeCtx, speechSynthesis: { cancel() {}, speak: (u) => spoken.push(u.text) }, SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } } };
  const quiet = createSound({ on: false, audio });
  quiet.pageTurn();
  assert.equal(made.length, 0);
  assert.equal(quiet.speak('hi'), false);
  const loud = createSound({ on: true, audio });
  loud.pageTurn();
  assert.equal(made.length, 1);
  assert.equal(loud.speak('hello'), true);
  assert.deepEqual(spoken, ['hello']);
  loud.set(false);
  assert.equal(loud.isOn(), false);
  const memory = new Map();
  const store = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  assert.equal(loadSound(store), true);
  saveSound(false, store);
  assert.equal(loadSound(store), false);
  assert.equal(loadSound({ getItem() { throw new Error('blocked'); } }), true);
  assert.doesNotThrow(() => createSound({ on: true, audio: {} }).pageTurn());   // no audio support: silence, no error
});

test('the opening animation plays once, never for reduced motion, a repeat visit or a link to a specific screen', async () => {
  const { shouldPlayIntro } = await import('../js/components/intro.js');
  assert.equal(shouldPlayIntro({ reduceMotion: false, seen: false, deepLink: false }), true);
  assert.equal(shouldPlayIntro({ reduceMotion: true, seen: false, deepLink: false }), false);
  assert.equal(shouldPlayIntro({ reduceMotion: false, seen: true, deepLink: false }), false);
  assert.equal(shouldPlayIntro({ reduceMotion: false, seen: false, deepLink: true }), false);
});

test('the streak card words its note for no streak, a first day and a run', async () => {
  const { streakNote } = await import('../js/components/rail.js');
  assert.equal(streakNote(0), 'Study today to start a streak.');
  assert.equal(streakNote(1), 'A first day. Come back tomorrow.');
  assert.equal(streakNote(7), '7 days in a row. Keep it going.');
});
