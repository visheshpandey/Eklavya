// Turns a one-line formula ("Precision = TP / (TP + FP)") into parts the whiteboard can draw as stacked fractions.
// Pure string work, no DOM: unit-tested in tests/board.test.js.
//
// A side is drawn as a fraction only when that is mathematically the same formula:
//   numerator:   no top-level + or - (a product like "2 x (P x R)" is fine: a x b / c = (a x b) / c)
//   denominator: one term or one bracket group ("b x c" is not, because a / b x c = (a / b) x c)
// Anything else stays as plain text, exactly as written.

const ADDITIVE = new Set(['+', '-', '−']);
const ANY_OPERATOR = new Set(['+', '-', '−', 'x', '×', '*', '·', '/']);
const COMPARISON_NEIGHBOURS = new Set(['<', '>', '!', '=', '≤', '≥']);

/** Remove one pair of brackets that wraps the whole text: "(TP + FP)" -> "TP + FP", but not "(a) / (b)". */
export function stripOuterParens(text) {
  const t = text.trim();
  if (!t.startsWith('(') || !t.endsWith(')')) return t;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '(') depth++;
    else if (t[i] === ')') depth--;
    if (depth === 0 && i < t.length - 1) return t;   // the first bracket closes early: it does not wrap everything
  }
  return t.slice(1, -1).trim();
}

/** Indexes of characters outside brackets for which `match(ch, i)` is true. */
function topLevel(text, match) {
  const found = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && match(ch, i)) found.push(i);
  }
  return found;
}

function splitAt(text, indexes) {
  const parts = [];
  let start = 0;
  for (const i of indexes) { parts.push(text.slice(start, i)); start = i + 1; }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim());
}

/** "=" signs that are equations, not part of <=, >=, ==, != (those stay inside their side). */
const isEquals = (text) => (ch, i) => ch === '=' && !COMPARISON_NEIGHBOURS.has(text[i - 1]) && !COMPARISON_NEIGHBOURS.has(text[i + 1]);

/** A binary operator from `set` outside brackets ("x" only as a word on its own, a leading minus is a sign). */
function hasTopLevelOperator(text, set) {
  const t = text.trim();
  return topLevel(t, (ch, i) => {
    if (!set.has(ch)) return false;
    if (ch === 'x') return /\s/.test(t[i - 1] ?? '') && /\s/.test(t[i + 1] ?? '');
    if (ch === '-' || ch === '−') return i > 0;
    return true;
  }).length > 0;
}

function side(text) {
  const slashes = topLevel(text, (ch) => ch === '/');
  if (slashes.length === 1) {
    const [num, den] = splitAt(text, slashes);
    if (num && den && !hasTopLevelOperator(num, ADDITIVE) && !hasTopLevelOperator(den, ANY_OPERATOR)) {
      return { num: stripOuterParens(num), den: stripOuterParens(den) };
    }
  }
  return { text };
}

/** "A = B / (C + D) = 0.8" -> [{text: 'A'}, {num: 'B', den: 'C + D'}, {text: '0.8'}] */
export function parseFormula(formula) {
  const text = String(formula ?? '');
  return splitAt(text, topLevel(text, isEquals(text))).filter(Boolean).map(side);
}
