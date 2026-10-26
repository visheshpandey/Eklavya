// Turns a one-line formula ("Precision = TP / (TP + FP)") into parts the whiteboard can draw as stacked fractions.
// Pure string work, no DOM: unit-tested in tests/board.test.js.

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

/** Split at `separator` characters that are not inside brackets. */
function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === separator && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim());
}

/**
 * "A = B / (C + D) = 0.8" -> [{text: 'A'}, {num: 'B', den: 'C + D'}, {text: '0.8'}]
 * A side becomes a fraction only when it has exactly one top-level "/" with something on both sides.
 */
export function parseFormula(formula) {
  return splitTopLevel(String(formula ?? ''), '=').filter(Boolean).map((side) => {
    const halves = splitTopLevel(side, '/');
    if (halves.length === 2 && halves[0] && halves[1]) return { num: stripOuterParens(halves[0]), den: stripOuterParens(halves[1]) };
    return { text: side };
  });
}
