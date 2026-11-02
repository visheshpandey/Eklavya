// A small, safe markdown renderer for answers and cited passages. It builds DOM nodes with createElement/textContent only (never innerHTML),
// so nothing in the text can become markup. Supports headings, bold, italic, inline code, bullet and numbered lists, paragraphs, and ratios of
// metrics such as TP/(TP+FP), which are drawn as a stacked fraction. The question's words can be highlighted inside any of it.
import { splitByTerms } from './highlight.js';

/** Plain text with the markdown marks removed (pure): "### Precision **and** recall" -> "Precision and recall". */
export function stripMarkdown(text) {
  return String(text ?? '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[^*\w])([*_])(?!\s)(.+?)(?<!\s)\2(?![*\w])/g, '$1$3')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\$([^$]+)\$/g, '$1');
}

// a ratio of upper-case metric names or parenthesised sums: TP/(TP+FP), (TP+TN)/(TP+TN+FP+FN), Relevant retrieved / All retrieved
const RATIO = /(\([A-Za-z0-9+\-* ]{2,40}\)|[A-Z][A-Za-z0-9]{0,12}(?:\s*[+\-*]\s*[A-Z][A-Za-z0-9]{0,12})*)\s*\/\s*(\([A-Za-z0-9+\-* ]{2,40}\)|[A-Z][A-Za-z0-9]{0,12}(?:\s*[+\-*]\s*[A-Z][A-Za-z0-9]{0,12})*)/g;
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\$[^$]+\$|(?<![*\w])\*[^*\s][^*]*\*(?![*\w]))/g;

const make = (tag, className, children = []) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) node.append(child);
  return node;
};
const textWith = (text, terms) => splitByTerms(text, terms).map((piece) => {
  if (!piece.hit) return document.createTextNode(piece.text);
  const mark = document.createElement('mark');
  mark.textContent = piece.text;
  return mark;
});
const unparen = (side) => side.trim().replace(/^\((.*)\)$/, '$1');

function fraction(top, bottom) {
  const node = make('span', 'frac', [make('span', 'num', [document.createTextNode(unparen(top))]), make('span', 'den', [document.createTextNode(unparen(bottom))])]);
  node.setAttribute('role', 'math');
  node.setAttribute('aria-label', `${unparen(top)} over ${unparen(bottom)}`);
  return node;
}

/** Plain text that may hold ratios: the ratios become fractions, the rest is (highlighted) text. */
function withRatios(text, terms) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(RATIO)) {
    if (match.index > last) nodes.push(...textWith(text.slice(last, match.index), terms));
    nodes.push(fraction(match[1], match[2]));
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(...textWith(text.slice(last), terms));
  return nodes;
}

/** One line of inline markup as an array of nodes. */
export function inlineNodes(text, terms) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) nodes.push(...withRatios(text.slice(last, match.index), terms));
    const token = match[0];
    if (token.startsWith('**') || token.startsWith('__')) nodes.push(make('strong', '', withRatios(token.slice(2, -2), terms)));
    else if (token.startsWith('`')) nodes.push(make('code', '', [document.createTextNode(token.slice(1, -1))]));
    else if (token.startsWith('$')) nodes.push(make('span', 'math', withRatios(token.slice(1, -1), terms)));
    else nodes.push(make('em', '', withRatios(token.slice(1, -1), terms)));
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(...withRatios(text.slice(last), terms));
  return nodes;
}

/** Markdown text -> a DocumentFragment. `terms` are highlighted. `inline: true` keeps everything in one flow (headings become bold text). */
export function renderMarkdown(text, { terms = [], inline = false } = {}) {
  const fragment = document.createDocumentFragment();
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  let paragraph = [], list = null;
  const endParagraph = () => { if (paragraph.length) { fragment.append(make(inline ? 'span' : 'p', 'md-p', inlineNodes(paragraph.join(' '), terms))); if (inline) fragment.append(document.createTextNode(' ')); paragraph = []; } };
  const endList = () => { if (list) { fragment.append(list); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) { endParagraph(); endList(); continue; }
    if (heading) {
      endParagraph(); endList();
      fragment.append(make(inline ? 'strong' : 'p', inline ? '' : 'md-h', inline ? [...inlineNodes(heading[2], terms), document.createTextNode(' ')] : [make('strong', '', inlineNodes(heading[2], terms))]));
    } else if (bullet || numbered) {
      endParagraph();
      const tag = numbered ? 'ol' : 'ul';
      if (!list || list.tagName.toLowerCase() !== tag) { endList(); list = make(tag, 'md-list'); }
      list.append(make('li', '', inlineNodes((bullet ?? numbered)[1], terms)));
    } else { endList(); paragraph.push(line.trim()); }
  }
  endParagraph(); endList();
  return fragment;
}
