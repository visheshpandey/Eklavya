// The whiteboard: what Eklavya is explaining, drawn while it talks (formula, steps or table), with earlier boards one tap away.
import { el, render as replaceContent } from '../lib/dom.js';
import { parseFormula } from '../lib/formula.js';
import { selectBoardIndex, selectBoards } from '../state/selectors.js';

/** "A = B / C" as big type, with each fraction stacked. */
function formulaLine(text, className) {
  const parts = parseFormula(text);
  return el('p', { class: className, role: 'math', 'aria-label': text },
    parts.flatMap((part, i) => [
      i ? el('span', { class: 'eq', 'aria-hidden': 'true', text: '=' }) : null,
      part.text != null
        ? el('span', { class: 'term', 'aria-hidden': 'true', text: part.text })
        : el('span', { class: 'frac', 'aria-hidden': 'true' }, el('span', { class: 'num', text: part.num }), el('span', { class: 'den', text: part.den })),
    ]));
}

function formulaBody(board) {
  return [
    formulaLine(board.formula, 'formula'),
    board.items.length ? el('ul', { class: 'board-where', 'aria-label': 'Where' }, board.items.map((line) => el('li', { text: line }))) : null,
    board.result ? el('div', { class: 'board-result' }, el('span', { class: 'board-label', text: 'Example' }), formulaLine(board.result, 'formula formula-sm')) : null,
  ];
}

function stepsBody(board) {
  return el('ol', { class: 'board-steps' }, board.items.map((step, i) => {
    const n = i + 1;
    const state = !board.highlight ? '' : n < board.highlight ? ' is-done' : n === board.highlight ? ' is-now' : '';
    return el('li', { class: `board-step${state}`, 'aria-current': n === board.highlight ? 'step' : null },
      el('span', { class: 'step-num', 'aria-hidden': 'true', text: String(n) }), el('span', { text: step }));
  }));
}

function tableBody(board) {
  return el('div', { class: 'board-table-wrap' },
    el('table', { class: 'board-table' },
      el('thead', {}, el('tr', {}, board.headers.map((h) => el('th', { scope: 'col', text: h })))),
      el('tbody', {}, board.rows.map((row) => el('tr', {}, row.map((cell, i) => (i === 0 ? el('th', { scope: 'row', text: cell }) : el('td', { text: cell }))))))));
}

const BODIES = { formula: formulaBody, steps: stepsBody, table: tableBody };

export function mountWhiteboard({ store, root, onPick }) {
  let shownKey = null;   // replay the reveal only when a different board appears, not on every redraw

  function draw() {
    const boards = selectBoards(store.getState());
    const index = selectBoardIndex(store.getState());
    const board = boards[index];
    root.hidden = !board;
    if (!board) { replaceContent(root); shownKey = null; return; }

    const key = `${index}:${board.title}:${board.kind}`;
    const card = el('div', { class: `board-card board-${board.kind}${key !== shownKey ? ' is-new' : ''}` },
      el('h3', { class: 'board-title', id: 'board-title', text: board.title }),
      (BODIES[board.kind] ?? (() => null))(board));
    shownKey = key;

    replaceContent(root,
      el('div', { class: 'board-head' },
        el('span', { class: 'board-label', text: 'Whiteboard' }),
        boards.length > 1
          ? el('div', { class: 'board-history', role: 'group', 'aria-label': 'Earlier boards' }, boards.map((b, i) =>
            el('button', { class: 'chip', type: 'button', 'aria-pressed': String(i === index), onclick: () => onPick(i) }, b.title)))
          : null),
      card);
  }

  store.select(selectBoards, draw);
  store.select(selectBoardIndex, draw);
}
