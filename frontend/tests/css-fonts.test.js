// Readability: nothing in the stylesheets may be set below 13px (0.8125rem); the base type, the rail and the helper colour follow the brief.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = new URL('../css/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.css'));
const read = (f) => readFileSync(join(fileURLToPath(dir), f), 'utf8');
const MIN_PX = 13;

function tooSmall(css) {
  const found = [];
  const toPx = (value, unit) => (unit === 'px' ? value : value * 16);
  for (const m of css.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) if (toPx(Number(m[1]), m[2]) < MIN_PX - 0.01) found.push(m[0]);
  for (const m of css.matchAll(/(?:^|[;{\s])font:\s*(?:(?:italic|normal|bold|\d{3})\s+)*([\d.]+)(px|rem)/g)) if (toPx(Number(m[1]), m[2]) < MIN_PX - 0.01) found.push(m[0].trim());
  return found;
}

test('no font size in any stylesheet is below 13px (0.8125rem)', () => {
  for (const file of files) assert.deepEqual(tooSmall(read(file)), [], `${file} sets text under 13px`);
});

test('the size tokens, the body type and the rail follow the brief', () => {
  const tokens = read('tokens.css');
  const size = (name) => { const m = new RegExp(`--${name}:\\s*([\\d.]+)rem`).exec(tokens); return m ? Number(m[1]) : NaN; };
  assert.ok(size('text-xs') >= 0.8125);                       // the smallest token is 13px
  assert.equal(size('text-md'), 1.0625);                      // body text 1.0625rem
  assert.ok(size('text-sm') >= 0.9375);                       // helper text 0.9375rem
  assert.match(tokens, /--leading:\s*1\.6;/);                 // line height 1.6
  assert.match(tokens, /--rail-w:\s*250px;/);                 // sidebar 250px
  assert.match(read('shell.css'), /\.rtab \{[^}]*font-size: 1\.0625rem/s);   // sidebar nav text 1.0625rem
});

test('helper text is darker than #5a655f and the mono labels have the right spacing', () => {
  const hex = /--ink-3:\s*(#[0-9a-f]{6});/i.exec(read('tokens.css'))[1];     // the first (light theme) value
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  assert.ok(lum(hex) < lum('#5a655f'));
  const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  assert.ok(contrast(hex, '#f2efe7') >= 4.5, `ink-3 on the page background is ${contrast(hex, '#f2efe7').toFixed(1)}:1`);
  assert.match(read('shell.css'), /\.mono \{ font: 500 13px\/1\.4 var\(--font-mono\); letter-spacing: \.06em;/);
});
