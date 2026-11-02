// The markdown renderer never shows markdown symbols, never makes markup out of text, and draws metric ratios as fractions.
import test from 'node:test';
import assert from 'node:assert/strict';

import { stripMarkdown } from '../js/lib/markdown.js';

test('stripMarkdown removes heading, emphasis, list and code marks', () => {
  assert.equal(stripMarkdown('### Precision and Recall Trade-offs'), 'Precision and Recall Trade-offs');
  assert.equal(stripMarkdown('**Precision** is _how many_ picks are right, see `TP`'), 'Precision is how many picks are right, see TP');
  assert.equal(stripMarkdown('- one\n* two\n• three'), 'one\ntwo\nthree');
  assert.equal(stripMarkdown('so $a+b$ holds'), 'so a+b holds');
});

test('stripMarkdown leaves ordinary text, snake_case words and multiplication alone', () => {
  assert.equal(stripMarkdown('use file_name_here and 3*4 = 12'), 'use file_name_here and 3*4 = 12');
});
