import test from 'node:test';
import assert from 'node:assert/strict';
import { stripForeignScripts } from '../js/lib/script-filter.js';

test('Bengali, Tamil and Urdu letters are dropped; Latin, Devanagari, digits, punctuation and maths stay', () => {
  assert.equal(stripForeignScripts('Magar woh \u09a0\u09bf\u0995 tha?'), 'Magar woh tha?');
  assert.equal(stripForeignScripts('ok \u0ba4\u0bae\u0bbf\u0bb4\u0bcd \u0633\u0644\u0627\u0645 fine'), 'ok fine');
  const keep = 'Precision = TP / (TP + FP) \u2192 75% \u03b1 \u0905\u091a\u094d\u091b\u093e caf\u00e9, 3 \u00d7 4.';
  assert.equal(stripForeignScripts(keep), keep);
  assert.equal(stripForeignScripts(''), '');
  assert.equal(stripForeignScripts(undefined), '');
});

test('tool-call markup the model leaks into its words is removed; maths with < and > stays', () => {
  assert.equal(stripForeignScripts('Chaliye. <function_calls> <tool_code> ask() </tool_code> </function_calls> Pehla sawaal.'), 'Chaliye. Pehla sawaal.');
  assert.equal(stripForeignScripts('Sahi hai. <function_calls> <tool'), 'Sahi hai. ');
  assert.equal(stripForeignScripts('a < b and c > d'), 'a < b and c > d');
});
