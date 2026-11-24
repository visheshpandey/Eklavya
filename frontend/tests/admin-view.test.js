import test from 'node:test';
import assert from 'node:assert/strict';
import { filterStudents, byRecent, totalActions, seen, joined, doneText } from '../js/lib/admin-view.js';

const people = [
  { id: 1, name: 'Asha Rao', email: 'asha@example.com', last_active: '2026-11-22 10:00:00' },
  { id: 2, name: 'Dev Mehta', email: 'dev@gmail.com', last_active: null },
  { id: 3, name: 'Ravi', email: 'ravi@example.com', last_active: '2026-11-23 09:00:00' },
];

test('search matches name or email, ignoring case', () => {
  assert.deepEqual(filterStudents(people, 'ASHA').map((s) => s.id), [1]);
  assert.deepEqual(filterStudents(people, 'gmail').map((s) => s.id), [2]);
  assert.equal(filterStudents(people, '  ').length, 3);
  assert.equal(filterStudents(people, 'nobody').length, 0);
});

test('most recently active first, the never-active last', () => {
  assert.deepEqual(byRecent(people).map((s) => s.id), [3, 1, 2]);
  assert.deepEqual(people.map((s) => s.id), [1, 2, 3]);   // the original list is not reordered
});

test('what a student has done', () => {
  assert.equal(totalActions({ questions: 2, quiz_answers: 3 }), 5);
  assert.equal(doneText({ questions: 12, quiz_answers: 5, notes: 0 }), '12 questions · 5 quiz answers');
  assert.equal(doneText({}), 'nothing yet');
});

test('dates', () => {
  assert.equal(seen(null, 0), '–');
  assert.equal(seen('2026-11-24 12:00:00', Date.parse('2026-11-24T12:05:00Z')), '5 min ago');
  assert.equal(joined(null), 'before tracking');
  assert.equal(joined('2026-11-20 08:00:00'), '20 Nov 2026');
});
