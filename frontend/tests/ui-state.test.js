// UI-level state (which section is showing, library search, folded notes, theme) and the chart data helper.
import test from 'node:test';
import assert from 'node:assert/strict';

import { initialState, reducer, VIEWS, THEMES } from '../js/state/reducer.js';
import { actions } from '../js/state/actions.js';
import { buildSeries, valuesAt, MAX_SERIES } from '../js/lib/chart-data.js';

const run = (...acts) => acts.reduce((state, action) => reducer(state, action), initialState);

test('the app opens on the Study section with an empty library search and nothing folded', () => {
  assert.deepEqual(initialState.ui, { view: 'study', librarySearch: '', collapsedDocs: {}, theme: 'system' });
});

test('sections can be switched, and unknown sections are ignored', () => {
  assert.equal(run(actions.viewChanged(VIEWS.PROGRESS)).ui.view, 'progress');
  assert.equal(run(actions.viewChanged(VIEWS.LIBRARY)).ui.view, 'library');
  const s = run(actions.viewChanged('nonsense'));
  assert.equal(s, initialState);                                              // unchanged object: no re-render
});

test('picking a topic or starting a session takes the student to Study', () => {
  const fromLibrary = run(actions.viewChanged(VIEWS.LIBRARY), actions.topicSelected(4));
  assert.equal(fromLibrary.ui.view, 'study');
  const fromProgress = run(actions.viewChanged(VIEWS.PROGRESS), actions.sessionStarted({ mode: 'learn', topicId: 4 }));
  assert.equal(fromProgress.ui.view, 'study');
});

test('library search is stored as typed and cleared when new notes arrive', () => {
  let s = run(actions.librarySearched('gram'));
  assert.equal(s.ui.librarySearch, 'gram');
  s = reducer(s, actions.notesReset());
  assert.equal(s.ui.librarySearch, '');
});

test('notes can be folded and unfolded, independently', () => {
  let s = run(actions.documentToggled(7), actions.documentToggled(9));
  assert.deepEqual(s.ui.collapsedDocs, { 7: true, 9: true });
  s = reducer(s, actions.documentToggled(7));
  assert.deepEqual(s.ui.collapsedDocs, { 9: true });
});

test('theme accepts only system, light or dark and survives new notes', () => {
  let s = run(actions.themeChanged(THEMES.DARK));
  assert.equal(s.ui.theme, 'dark');
  assert.equal(reducer(s, actions.themeChanged('purple')), s);
  assert.equal(reducer(s, actions.notesReset()).ui.theme, 'dark');
});

// ----- chart data
const attempts = [
  { topic_id: 1, topic_name: 'Precision', mastery_before: 38, mastery_after: 30, is_correct: 0 },
  { topic_id: 1, topic_name: 'Precision', mastery_before: 30, mastery_after: 40.5, is_correct: 1 },
  { topic_id: 2, topic_name: 'Recall', mastery_before: 42, mastery_after: 50, is_correct: 1 },
  { topic_id: 1, topic_name: 'Precision', mastery_before: 40.5, mastery_after: 49, is_correct: 1 },
];

test('each topic line starts at its mastery before the first answer and x counts answers across topics', () => {
  const { series, xMax, answers } = buildSeries(attempts);
  assert.equal(xMax, 4); assert.equal(answers, 4);
  const precision = series.find((s) => s.name === 'Precision');
  assert.deepEqual(precision.points.map((p) => [p.x, p.y]), [[0, 38], [1, 30], [2, 40.5], [4, 49]]);
  assert.equal(precision.points[0].correct, null);                           // the starting value is not an answer
  const recall = series.find((s) => s.name === 'Recall');
  assert.deepEqual(recall.points.map((p) => [p.x, p.y]), [[2, 42], [3, 50]]);
});

test('the most recently practised topic comes first', () => {
  assert.deepEqual(buildSeries(attempts).series.map((s) => s.name), ['Precision', 'Recall']);
});

test('only the first MAX_SERIES topics are coloured; the rest are flagged and counted', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ topic_id: i + 1, topic_name: `T${i + 1}`, mastery_before: 50, mastery_after: 55, is_correct: 1 }));
  const { series, hiddenTopics } = buildSeries(many);
  assert.equal(series.length, 6);
  assert.equal(series.filter((s) => !s.other).length, MAX_SERIES);
  assert.equal(hiddenTopics, 2);
  assert.equal(series[0].name, 'T6');                                        // latest first
});

test('no attempts gives an empty chart, not an error', () => {
  assert.deepEqual(buildSeries([]).series, []);
  assert.deepEqual(buildSeries(null).series, []);
  assert.equal(buildSeries(null).xMax, 1);
});

test('values at an answer number hold each topic at its latest value so far', () => {
  const { series } = buildSeries(attempts);
  const at3 = Object.fromEntries(valuesAt(series, 3).map((v) => [v.name, v.value]));
  assert.deepEqual(at3, { Precision: 40.5, Recall: 50 });
  const at1 = Object.fromEntries(valuesAt(series, 1).map((v) => [v.name, v.value]));
  assert.deepEqual(at1, { Precision: 30, Recall: null });                    // Recall has not started yet at answer 1
  assert.equal(valuesAt(series, 4).find((v) => v.name === 'Precision').answeredNow, true);
  assert.equal(valuesAt(series, 4).find((v) => v.name === 'Recall').answeredNow, false);
});
