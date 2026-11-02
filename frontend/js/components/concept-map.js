// Concept map: topics as circles on a ring, linked when one topic's notes talk about another. A circle's colour is its status
// (Strong 80+, Growing 60-79, Revisit under 60) and it shows its percentage and, up to MAX_LABELLED topics, its name. Many topics: the
// ring grows and the names run outwards along their own spoke, so two names can never overlap.
//   - hover or keyboard focus on a circle dims the topics it is not linked to and lights its links, and shows a tip with the name
//   - click, tap, Enter or Space selects a circle: the card under the map shows its status and links, with "Learn this", "Test me" and "Ask about it"
// Circles are real buttons. The list under the picture says the same thing for screen readers.
import { el, render as replaceContent, svgEl } from '../lib/dom.js';
import { masteryStatus } from '../lib/subjects.js';
import { t } from '../lib/strings.js';
import { selectConceptMap, selectLanguage } from '../state/selectors.js';
import { sparkline } from '../lib/sparkline.js';
import { masteryHistory } from '../lib/mastery-history.js';

const statusOf = (node) => (node.started === false ? { key: 'new', label: 'Not started' } : masteryStatus(node.mastery));

const STEPS = 5;                  // colour steps used by older code and tests
export const MAX_LABELLED = 30;   // above this many topics the names are left to the tip and the list
const RADIAL_FROM = 11;           // from this many topics the names run outwards along a spoke instead of sitting beside the circle

export const masteryStep = (mastery) => Math.min(STEPS, Math.max(1, Math.ceil((mastery / 100) * STEPS)));

/** Sizes for a given number of topics (pure): canvas, ring, circle, how many characters of a name fit, and the label style. */
export function mapGeometry(count) {
  const radial = count >= RADIAL_FROM;
  const labelled = count <= MAX_LABELLED;
  const ringRadius = radial ? Math.max(135, Math.ceil(4.6 * count)) : 420 / 2 - 70;   // wider ring for more topics: circles never touch
  // circles shrink as the ring fills, but stay big enough for a 3-digit percentage
  const nodeRadius = Math.max(11, Math.min(20, Math.floor((Math.PI * ringRadius) / Math.max(count, 1) - 4)));
  const labelChars = radial ? 26 : 22;   // radial names run along a spoke on one line; the others wrap onto two lines of this length
  const room = Math.ceil(labelChars * 5.8) + 14;   // the room a name needs beyond its circle (10.5px type)
  const size = !radial ? 420 + 2 * 60 : labelled ? Math.max(600, 2 * (ringRadius + nodeRadius + room)) : 2 * (ringRadius + nodeRadius + 16);
  return { size, ringRadius, nodeRadius, radial, labelChars, labelled };
}

/** Positions on a ring, in the order given (topics of one document stay together). */
export function ringLayout(count, size = 420, radius = size / 2 - 70) {
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, count);
    return { x: size / 2 + radius * Math.cos(angle), y: size / 2 + radius * Math.sin(angle), angle };
  });
}

const shorten = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** A name on up to `maxLines` lines of about `perLine` characters, broken at spaces; only a name longer than all lines together is cut. */
export function wrapLabel(text, perLine = 22, maxLines = 2) {
  const lines = [];
  let current = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (current && `${current} ${word}`.length > perLine) { lines.push(current); current = word; } else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines.map((line) => shorten(line, perLine + 6));
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = shorten(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, perLine + 6);
  return kept;
}

export function mountConceptMap({ store, root, onStudy, onAsk, onTest = null, onSelected = null, onAddNotes = null }) {
  let selected = null;   // the circle whose card is showing; kept when the map redraws

  function draw() {
    const state = store.getState();
    const map = selectConceptMap(state);
    const language = selectLanguage(state);
    if (!map?.nodes?.length) {
      replaceContent(root, el('div', { class: 'empty-state' }, el('p', { text: 'Add notes to see how your ideas connect.' }),
        onAddNotes ? el('button', { class: 'btn btn-primary', type: 'button', onclick: onAddNotes }, 'Add notes ↗') : null));
      return;
    }

    const nodes = map.nodes;
    if (!nodes.some((n) => n.id === selected)) selected = null;
    const geo = mapGeometry(nodes.length);
    const at = new Map(ringLayout(nodes.length, geo.size, geo.ringRadius).map((p, i) => [nodes[i].id, p]));
    const maxWeight = Math.max(1, ...map.links.map((l) => l.weight));
    const names = new Map(nodes.map((n) => [n.id, n.topic]));
    const neighbours = (id) => map.links.filter((l) => l.source === id || l.target === id).map((l) => (l.source === id ? l.target : l.source));
    const svg = svgEl('svg', { viewBox: `0 0 ${geo.size} ${geo.size}`, class: 'map-svg' });
    const tip = el('div', { class: 'map-tip', role: 'status', hidden: '' });
    const frame = el('div', { class: 'map-frame' }, svg, tip);
    const detail = el('div', { class: 'card detail', id: 'mapDetail' });

    const edges = map.links.flatMap((link) => {
      const a = at.get(link.source), b = at.get(link.target);
      if (!a || !b) return [];
      const line = svgEl('line', { class: 'map-link', x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'stroke-width': 1 + (2 * link.weight) / maxWeight });
      line.dataset.a = String(link.source); line.dataset.b = String(link.target);
      svg.append(line);
      return [line];
    });
    const groups = new Map();

    const spotlight = (id) => {   // dim what is not linked to `id`, light its links; null puts everything back
      const near = id == null ? [] : neighbours(id);
      groups.forEach((group, key) => group.classList.toggle('dim', id != null && key !== id && !near.includes(key)));
      edges.forEach((line) => line.classList.toggle('hot', id != null && (line.dataset.a === String(id) || line.dataset.b === String(id))));
    };
    const showTip = (node, p) => {
      tip.textContent = node.started === false ? `${node.topic}, not started` : `${node.topic}, ${Math.round(node.mastery)}%`;
      tip.style.left = `${(p.x / geo.size) * 100}%`;
      tip.style.top = `${((p.y - geo.nodeRadius) / geo.size) * 100}%`;
      tip.hidden = false;
    };
    const hideTip = () => { tip.hidden = true; };

    function drawDetail() {
      const node = nodes.find((n) => n.id === selected);
      if (!node) {
        replaceContent(detail, el('div', {}, el('span', { class: 'mono', text: 'Select a topic' }), el('h3', { class: 'serif-sm', text: 'Tap any topic on the map' }),
          el('p', { text: 'You\'ll see its mastery and what it links to.' })));
        return;
      }
      const status = statusOf(node);
      const linked = neighbours(node.id).map((id) => names.get(id));
      const trend = sparkline(masteryHistory.values(node.id), { width: 120, height: 32 });
      replaceContent(detail,
        el('div', {}, el('span', { class: 'mono', text: node.started === false ? 'Not started' : `${status.label} · ${Math.round(node.mastery)}% mastery` }), el('h3', { class: 'serif-sm', text: node.topic }), trend,
          el('p', { text: linked.length ? `Connects to ${linked.join(', ')}.` : 'No links found in your notes yet.' })),
        el('div', { class: 'acts' },
          el('button', { class: 'btn btn-primary', type: 'button', onclick: () => onStudy(node.id) }, 'Learn this ↗'),
          onTest ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => onTest(node.id) }, 'Test me') : null,
          el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => onAsk(node.topic) }, 'Ask about it')));
    }

    function select(id) {
      selected = id;
      onSelected?.(id);
      groups.forEach((group, key) => group.setAttribute('aria-pressed', String(key === id)));
      spotlight(id);
      drawDetail();
    }

    nodes.forEach((node) => {
      const p = at.get(node.id);
      const percent = Math.round(node.mastery);
      const status = statusOf(node);
      const pctSize = geo.nodeRadius >= 16 ? 12 : geo.nodeRadius >= 13 ? 10 : 9;
      let label = null;
      if (geo.labelled) {
        const distance = geo.nodeRadius + 7;
        const lx = p.x + Math.cos(p.angle) * distance;
        const ly = p.y + Math.sin(p.angle) * distance;
        const text = shorten(node.topic, geo.labelChars);
        if (geo.radial) {   // along the spoke, turned over on the left half so it never reads upside down
          const degrees = (p.angle * 180) / Math.PI;
          const left = Math.cos(p.angle) < 0;
          label = svgEl('text', { x: lx, y: ly, class: 'map-label map-label-radial', 'text-anchor': left ? 'end' : 'start',
            'dominant-baseline': 'middle', transform: `rotate(${left ? degrees + 180 : degrees} ${lx} ${ly})` }, text);
        } else {
          const outward = Math.cos(p.angle) >= 0 ? 'start' : 'end';
          const lines = wrapLabel(node.topic, geo.labelChars, 2);   // a long name goes on two lines instead of being cut
          label = svgEl('text', { x: lx, y: ly + 4 - (lines.length - 1) * 6, class: 'map-label', 'text-anchor': Math.abs(Math.cos(p.angle)) < 0.2 ? 'middle' : outward },
            lines.map((line, i) => svgEl('tspan', { x: lx, dy: i ? '1.15em' : '0' }, line)));
        }
      }
      const group = svgEl('g', { class: 'map-node', role: 'button', tabindex: '0', 'aria-pressed': String(node.id === selected), 'aria-label': node.started === false ? `${node.topic}, not started` : `${node.topic}, ${percent}%, ${status.label}` },
        svgEl('circle', { cx: p.x, cy: p.y, r: geo.nodeRadius, class: `map-dot st-${status.key === 'strong' ? 'strong' : status.key === 'grow' ? 'grow' : status.key === 'new' ? 'new' : 'low'}` }),
        svgEl('text', { x: p.x, y: p.y, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'map-pct', style: `font-size:${pctSize}px` }, node.started === false ? '·' : String(percent)),
        label);
      groups.set(node.id, group);
      group.addEventListener('pointerenter', (event) => { if (event.pointerType !== 'touch') { showTip(node, p); spotlight(node.id); } });
      group.addEventListener('pointerleave', (event) => { if (event.pointerType !== 'touch') { hideTip(); spotlight(selected); } });
      group.addEventListener('focus', () => { showTip(node, p); spotlight(node.id); });
      group.addEventListener('blur', () => { hideTip(); spotlight(selected); });
      group.addEventListener('click', () => select(node.id));
      group.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(node.id); } });
      svg.append(group);
    });

    const neighbourNames = (id) => neighbours(id).map((n) => names.get(n));
    replaceContent(root,
      frame,
      el('div', { class: 'maplegend' }, el('span', {}, el('i', { class: 'st-strong' }), 'Strong · 80%+'), el('span', {}, el('i', { class: 'st-grow' }), 'Growing · 60–79%'),
        el('span', {}, el('i', { class: 'st-low' }), 'Revisit · below 60%'), el('span', {}, el('i', { class: 'st-new' }), 'Not started')),
      detail,
      el('ul', { class: 'map-list' }, nodes.map((n) => {
        const linked = neighbourNames(n.id);
        return el('li', {},
          el('button', { class: 'link-btn', type: 'button', onclick: () => select(n.id) }, `${n.topic} · ${n.started === false ? 'not started' : `${Math.round(n.mastery)}%`}`), sparkline(masteryHistory.values(n.id)),
          el('span', { class: 'hint', text: linked.length ? t('map.links', language, { list: linked.join(', ') }) : t('map.alone', language) }));
      })));
    spotlight(selected);
    drawDetail();
    frame.classList.remove('drawn');
    requestAnimationFrame(() => frame.classList.add('drawn'));   // the links draw themselves in
  }

  document.addEventListener('eklavya:mastery-history', draw);   // the sparklines arrive after the map
  store.select(selectConceptMap, draw);
  store.select(selectLanguage, draw);
  return { select: (id) => { selected = id; draw(); } };
}
