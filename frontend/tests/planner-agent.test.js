import test from 'node:test';
import assert from 'node:assert/strict';
import { replanNote, agentLine } from '../js/components/exam-planner.js';

test('the re-plan sentence is shown when the agent sent one', () => {
  assert.equal(replanNote({ replan: { message: ' You missed 2 days; I moved Paging to Friday. ' } }), 'You missed 2 days; I moved Paging to Friday.');
});

test('no note when nothing was missed, or the answer has none', () => {
  assert.equal(replanNote({ replan: null }), null);
  assert.equal(replanNote({ replan: { message: '   ' } }), null);
  assert.equal(replanNote({}), null);
  assert.equal(replanNote(null), null);
  assert.equal(replanNote({ replan: { message: 42 } }), null);
});

test('the explanation follows the language and falls back to English', () => {
  assert.match(agentLine('english'), /re-plans by itself/);
  assert.match(agentLine('hindi'), /एकलव्य/);
  assert.equal(agentLine('hinglish'), agentLine('english'));
});
