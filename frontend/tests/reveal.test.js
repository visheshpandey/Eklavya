import test from 'node:test';
import assert from 'node:assert/strict';
import { reveal } from '../js/lib/reveal.js';

function fakeNode() {
  const attrs = {};
  const calls = [];
  return { calls, attrs, hasAttribute: (k) => k in attrs, setAttribute: (k, v) => { attrs[k] = v; },
    scrollIntoView: (o) => calls.push(['scroll', o]), focus: (o) => calls.push(['focus', o]) };
}
const win = (reduce) => ({ matchMedia: () => ({ matches: reduce }) });

test('a new answer is scrolled into view smoothly and focused for screen readers', () => {
  const node = fakeNode();
  reveal(node, win(false));
  assert.deepEqual(node.calls, [['scroll', { behavior: 'smooth', block: 'start' }], ['focus', { preventScroll: true }]]);
  assert.equal(node.attrs.tabindex, '-1');
});

test('reduced motion jumps instead of animating', () => {
  const node = fakeNode();
  reveal(node, win(true));
  assert.equal(node.calls[0][1].behavior, 'auto');
});

test('nothing to reveal is fine', () => { reveal(null, win(false)); });
