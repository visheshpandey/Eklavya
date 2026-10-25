// "Mastery over time": one line per topic you have answered questions on, x = answer number, y = mastery (0 to 100).
//
// Follows the data-viz rules: one axis, thin 2px lines, 8px markers, hairline gridlines, a legend whenever there are two
// or more lines (plus direct end labels when they fit), a crosshair readout on hover AND keyboard, text in ink colours
// (never the series colour), and a table view so no value depends on hovering or on telling colours apart.
// Marker shape is a second channel: filled dot = correct answer, hollow dot = wrong answer.
import { el, svgEl, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { round1 } from '../lib/format.js';
import { buildSeries, MAX_SERIES, valuesAt } from '../lib/chart-data.js';
import { selectProgress } from '../state/selectors.js';

const HEIGHT = 250;
const MARGIN = { top: 28, bottom: 36, left: 40 };
const LABEL_WIDTH = 150;        // room for direct end labels on wide charts
const MIN_WIDTH_FOR_LABELS = 560;
const LABEL_CHARS = 24;
const MIN_LABEL_GAP = 15;       // px between end labels before we give up and rely on the legend
const colourOf = (index) => (index < MAX_SERIES ? `var(--series-${index + 1})` : 'var(--series-muted)');
const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}...` : text);

export function mountMasteryChart({ store, root }) {
  let tableView = false;
  let activeX = null;
  let lastWidth = 0;

  const toggle = el('button', { class: 'btn btn-secondary', type: 'button', 'aria-pressed': 'false' });
  toggle.addEventListener('click', () => { tableView = !tableView; activeX = null; draw(); });

  function summaryText(data) {
    const lead = data.series[0];
    const first = lead.points[0].y;
    const last = lead.points[lead.points.length - 1].y;
    const answers = lead.points.length - 1;
    const others = data.series.length - 1;
    return `${lead.name} went from ${round1(first)}% to ${round1(last)}% over ${answers} ${answers === 1 ? 'answer' : 'answers'}`
      + (others ? `, and you practised ${others} other ${others === 1 ? 'topic' : 'topics'}.` : '.');
  }

  function table(rows) {
    return el('table', { class: 'chart-table' },
      el('caption', { text: 'Every answer, oldest first' }),
      el('thead', {}, el('tr', {}, ['Answer', 'Topic', 'Result', 'Mastery after'].map((h) => el('th', { scope: 'col', text: h })))),
      el('tbody', {}, rows.map((r, i) => el('tr', {},
        el('td', { text: String(i + 1) }), el('td', { text: r.topic_name }),
        el('td', { text: r.is_correct ? 'Correct' : 'Wrong' }), el('td', { text: `${round1(r.mastery_after)}%` })))));
  }

  function chartFrame(data, width) {
    const colored = data.series.slice(0, MAX_SERIES);
    const lastY = (s) => s.points[s.points.length - 1].y;
    const yPos = (y, innerH) => MARGIN.top + (1 - y / 100) * innerH;
    const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const ends = colored.map((s) => yPos(lastY(s), innerH)).sort((a, b) => a - b);
    const labelled = width >= MIN_WIDTH_FOR_LABELS && colored.length <= MAX_SERIES && ends.every((y, i) => i === 0 || y - ends[i - 1] >= MIN_LABEL_GAP);
    const right = labelled ? LABEL_WIDTH : 14;
    const innerW = width - MARGIN.left - right;
    const xPos = (x) => MARGIN.left + (x / data.xMax) * innerW;

    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${HEIGHT}`, width, height: HEIGHT, 'aria-hidden': 'true', focusable: 'false' });

    for (const tick of [0, 25, 50, 75, 100]) {                   // hairline, solid, recessive
      svg.append(svgEl('line', { class: tick === 0 ? 'axis' : 'grid', x1: MARGIN.left, x2: width - right, y1: yPos(tick, innerH), y2: yPos(tick, innerH) }),
        svgEl('text', { x: MARGIN.left - 8, y: yPos(tick, innerH) + 4, 'text-anchor': 'end' }, `${tick}`));
    }
    const step = Math.max(1, Math.ceil(data.xMax / 6));
    for (let x = 0; x <= data.xMax; x += step) {
      svg.append(svgEl('text', { x: xPos(x), y: HEIGHT - 16, 'text-anchor': 'middle' }, x === 0 ? 'start' : `${x}`));
    }
    svg.append(svgEl('text', { x: MARGIN.left + innerW / 2, y: HEIGHT - 2, 'text-anchor': 'middle' }, 'Answer number'),
      svgEl('text', { x: 4, y: 10 }, 'Mastery %'));

    const crosshair = svgEl('line', { class: 'crosshair', y1: MARGIN.top, y2: MARGIN.top + innerH, visibility: 'hidden' });
    svg.append(crosshair);

    data.series.forEach((s, i) => {                              // muted "other" topics first so coloured lines sit on top
      if (i < MAX_SERIES) return;
      svg.append(svgEl('path', { class: 'line', style: `stroke:${colourOf(i)}`, opacity: '0.7',
        d: s.points.map((p, k) => `${k ? 'L' : 'M'}${xPos(p.x)},${yPos(p.y, innerH)}`).join(' ') }));
    });
    colored.forEach((s, i) => {
      svg.append(svgEl('path', { class: 'line', style: `stroke:${colourOf(i)}`,
        d: s.points.map((p, k) => `${k ? 'L' : 'M'}${xPos(p.x)},${yPos(p.y, innerH)}`).join(' ') }));
      for (const p of s.points) {
        if (p.correct === null) continue;                        // the start of a line is not an answer
        svg.append(svgEl('circle', { class: 'dot', cx: xPos(p.x), cy: yPos(p.y, innerH), r: 4,
          style: p.correct ? `fill:${colourOf(i)}` : `fill:var(--surface);stroke:${colourOf(i)}` }));
      }
      if (labelled) {
        svg.append(svgEl('text', { class: 'end-label', x: xPos(s.points[s.points.length - 1].x) + 10, y: yPos(lastY(s), innerH) + 4 }, clip(s.name, LABEL_CHARS)));
      }
    });

    const tip = el('div', { class: 'tooltip', hidden: true });
    const frame = el('div', { class: 'chart-frame', tabindex: '0', role: 'group',
      'aria-label': `Mastery over time. ${summaryText(data)} Use the left and right arrow keys to read each answer.` }, svg, tip);

    function show(x) {
      activeX = x;
      crosshair.setAttribute('x1', xPos(x)); crosshair.setAttribute('x2', xPos(x));
      crosshair.setAttribute('visibility', 'visible');
      const rows = valuesAt(data.series, x).filter((v) => !v.other && v.value !== null);
      const title = el('div', { class: 'tooltip-title', text: x === 0 ? 'Before the first answer' : `After answer ${x}` });
      replaceContent(tip, title, ...rows.map((v) => {
        const index = data.series.findIndex((s) => s.topicId === v.topicId);
        return el('div', { class: 'tooltip-row' },
          el('span', { class: 'key', style: `background:${colourOf(index)}` }),
          el('span', { class: 'name', text: v.name }),
          el('strong', { text: `${round1(v.value)}%` }));
      }));
      tip.hidden = false;
      const frameWidth = frame.clientWidth;
      const left = xPos(x) + 14;
      tip.style.left = `${left + tip.offsetWidth > frameWidth ? Math.max(8, xPos(x) - tip.offsetWidth - 14) : left}px`;
      tip.style.top = `${MARGIN.top + 8}px`;
    }
    function hide() { activeX = null; crosshair.setAttribute('visibility', 'hidden'); tip.hidden = true; }

    svg.style.touchAction = 'pan-y';
    frame.addEventListener('pointermove', (e) => {              // the crosshair snaps to the nearest answer: aim at a position, not a 2px line
      const box = svg.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * width;
      show(Math.min(data.xMax, Math.max(0, Math.round(((px - MARGIN.left) / innerW) * data.xMax))));
    });
    frame.addEventListener('pointerleave', hide);
    frame.addEventListener('blur', hide);
    frame.addEventListener('focus', () => { if (activeX === null) show(data.xMax); });
    frame.addEventListener('keydown', (e) => {
      const x = activeX ?? data.xMax;
      const next = { ArrowLeft: x - 1, ArrowRight: x + 1, Home: 0, End: data.xMax }[e.key];
      if (e.key === 'Escape') { hide(); return; }
      if (next === undefined) return;
      e.preventDefault();
      show(Math.min(data.xMax, Math.max(0, next)));
    });
    if (activeX !== null) show(Math.min(activeX, data.xMax));
    return frame;
  }

  function legend(data) {
    const colored = data.series.slice(0, MAX_SERIES);
    const items = colored.map((s, i) => el('li', {}, el('span', { class: 'key', style: `background:${colourOf(i)}` }), el('span', { text: s.name })));
    if (data.hiddenTopics) items.push(el('li', {}, el('span', { class: 'key', style: 'background:var(--series-muted)' }), el('span', { text: `${data.hiddenTopics} more ${data.hiddenTopics === 1 ? 'topic' : 'topics'} (see the table)` })));
    return el('ul', { class: 'legend', 'aria-label': 'Legend' }, items);
  }

  function draw() {
    const rows = selectProgress(store.getState());
    if (rows === null) { replaceContent(root, el('p', { class: 'empty', text: 'Loading...' })); return; }
    const data = buildSeries(rows);
    if (!data.answers) {
      replaceContent(root, el('div', { class: 'empty-state' }, el('strong', { text: 'No answers yet' }),
        el('p', { text: 'Take a voice test on any topic and your mastery will be charted here, answer by answer.' })));
      return;
    }
    lastWidth = Math.floor(root.clientWidth) || 640;
    toggle.replaceChildren(icon(tableView ? 'chart-line' : 'table', { size: 18 }), tableView ? 'View as chart' : 'View as table');
    toggle.setAttribute('aria-pressed', String(tableView));

    replaceContent(root,
      el('div', { class: 'chart-bar' }, el('p', { class: 'hint', text: summaryText(data) }), toggle),
      tableView ? table(rows) : chartFrame(data, Math.max(300, lastWidth - 34)),
      !tableView && data.series.length > 1 ? legend(data) : null,
      !tableView ? el('p', { class: 'hint', text: 'Filled dot: correct answer. Hollow dot: wrong answer.' }) : null);
  }

  store.select(selectProgress, draw);
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => { if (Math.abs(Math.floor(root.clientWidth) - lastWidth) > 8 && !tableView) draw(); }).observe(root);
  }
}
