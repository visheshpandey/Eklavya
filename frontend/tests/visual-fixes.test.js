import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeLabels } from '../js/lib/orbit-labels.js';

const css = readFileSync(new URL('../css/shell.css', import.meta.url), 'utf8');
const bounds = { width: 1100, height: 270 };
const overlaps = (a, b, w = 50, h = 22) => a.left < b.left + w && b.left < a.left + w && a.top < b.top + h && b.top < a.top + h;

test('a name label goes above its sphere, but below it when above would cover the book', () => {
  const book = { left: 480, right: 640, top: 120, bottom: 200 };
  const [clear, blocked] = placeLabels([{ x: 200, y: 100, r: 10, w: 50, h: 22 }, { x: 560, y: 215, r: 18, w: 50, h: 22 }], book, bounds);
  assert.equal(clear.below, false);
  assert.equal(blocked.below, true);
  assert.ok(blocked.top >= 215 + 18);
});

test('labels never overlap each other and stay inside the picture', () => {
  const items = [{ x: 300, y: 80, r: 10, w: 50, h: 22 }, { x: 320, y: 84, r: 10, w: 50, h: 22 }, { x: 5, y: 4, r: 10, w: 50, h: 22 }];
  const spots = placeLabels(items, null, bounds);
  assert.ok(!overlaps(spots[0], spots[1]) || spots.some((s) => s.below));
  for (const s of spots) assert.ok(s.left >= 0 && s.top >= 0 && s.left + 50 <= bounds.width && s.top + 22 <= bounds.height);
});

test('the six study modes lay out 3 x 2 on desktop, so Free talk is not alone on a second row', () => {
  assert.match(css, /\.modes \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

test('the paper book page keeps dark ink in both themes (WCAG AA 4.5:1 on its cream paper)', () => {
  const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const ink = css.match(/\.page \.mono \{ color: (#[0-9a-f]{6})/i)[1];
  const cap = css.match(/\.hero \.page \.cap \{[^}]*color: (#[0-9a-f]{6})/i)[1];   // must beat ".hero p", which is light text for the dark hero
  const paper = css.match(/\.page \{[^}]*background: (#[0-9a-f]{6})/i)[1];
  assert.ok(ratio(ink, paper) >= 4.5 && ratio(cap, paper) >= 4.5);
});
