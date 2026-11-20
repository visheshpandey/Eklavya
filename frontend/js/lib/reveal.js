// Bring something new into view and hand it to screen readers (used for a fresh Ask answer that would otherwise appear below the fold).
// Smooth scrolling only when the student has not asked for reduced motion. Pure apart from the node and window it is given, so it is tested with fakes.

export const prefersReducedMotion = (win = globalThis) => Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** Scroll `node` into view (smoothly unless reduced motion) and move focus to it without a second jump. */
export function reveal(node, win = globalThis) {
  if (!node) return;
  if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');   // focusable by script, not in the tab order
  node.scrollIntoView?.({ behavior: prefersReducedMotion(win) ? 'auto' : 'smooth', block: 'start' });
  node.focus?.({ preventScroll: true });
}
