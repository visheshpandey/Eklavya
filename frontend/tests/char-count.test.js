import test from 'node:test';
import assert from 'node:assert/strict';
import { ASK_MAX, charCount } from '../js/lib/char-count.js';
import { t } from '../js/lib/strings.js';

test('the count stays hidden until the question nears the limit, then is shown and flagged once over', () => {
  assert.equal(ASK_MAX, 2000);
  assert.equal(charCount(100).show, false);
  assert.deepEqual(charCount(1650), { show: true, over: false, text: '1,650 / 2,000' });
  assert.equal(charCount(2001).over, true);
});

test('a too-long question gets a specific message', () => {
  assert.equal(t('ask.tooLong', 'english', { max: '2,000' }), 'Your question is too long. Please keep it under 2,000 characters.');
});
