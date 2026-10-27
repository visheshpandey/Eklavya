// Concept map: topics as circles on a ring, linked when one topic's notes talk about another; the colour shows
// mastery (one hue, light = weak, strong = mastered). The picture is decorative for screen readers: the list
// under it says the same thing and its buttons open the topic.
import { el, render as replaceContent, svgEl } from '../lib/dom.js';
import { t } from '../lib/strings.js';
import { selectConceptMap, selectLanguage } from '../state/selectors.js';

const SIZE = 420;
const NODE_R = 20;
const STEPS = 5;   // colour steps: --map-1 (weak) to --map-5 (strong)
export const MAX_LABELLED = 12;   // above this many topics the circles go unlabelled (the list under the picture names them)

export const masteryStep = (mastery) => Math.min(STEPS, Math.max(1, Math.ceil((mastery / 100) * STEPS)));

/** Positions on a ring, in the order given (topics of one document stay together). */
export function ringLayout(count, size = SIZE) {
  const radius = size / 2 - 70;
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, count);
    return { x: size / 2 + radius * Math.cos(angle), y: size / 2 + radius * Math.sin(angle), angle };
  });
}

export function mountConceptMap({ store, root, onOpenTopic }) {
  function draw() {
    const state = store.getState();
    const map = selectConceptMap(state);
    const language = selectLanguage(state);
    if (!map?.nodes?.length) { replaceContent(root, el('p', { class: 'empty', text: t('map.empty', language) })); return; }

    const nodes = map.nodes;
    const at = new Map(ringLayout(nodes.length).map((p, i) => [nodes[i].id, p]));
    const maxWeight = Math.max(1, ...map.links.map((l) => l.weight));
    const svg = svgEl('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'map-svg', 'aria-hidden': 'true', focusable: 'false' });

    for (const link of map.links) {
      const a = at.get(link.source), b = at.get(link.target);
      if (a && b) svg.append(svgEl('line', { class: 'map-link', x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'stroke-width': 1 + (2 * link.weight) / maxWeight }));
    }
    const labelled = nodes.length <= MAX_LABELLED;   // 13+ labels collide on the ring: hover or the list gives the name
    const radius = labelled ? NODE_R : Math.max(9, NODE_R - Math.floor((nodes.length - MAX_LABELLED) / 2));
    nodes.forEach((node) => {
      const p = at.get(node.id);
      const outward = Math.cos(p.angle) >= 0 ? 'start' : 'end';
      const lx = p.x + Math.cos(p.angle) * (radius + 6);
      const ly = p.y + Math.sin(p.angle) * (radius + 6) + 4;
      const label = node.topic.length > 22 ? `${node.topic.slice(0, 21)}…` : node.topic;
      svg.append(svgEl('g', { class: 'map-node' },
        svgEl('title', {}, `${node.topic}, ${Math.round(node.mastery)}%`),
        svgEl('circle', { cx: p.x, cy: p.y, r: radius, class: `map-dot step-${masteryStep(node.mastery)}` }),
        labelled ? svgEl('text', { x: p.x, y: p.y + 4, 'text-anchor': 'middle', class: 'map-pct' }, `${Math.round(node.mastery)}`) : null,
        labelled ? svgEl('text', { x: lx, y: ly, 'text-anchor': Math.abs(Math.cos(p.angle)) < 0.2 ? 'middle' : outward, class: 'map-label' }, label) : null));
    });
    // circles are also clickable with a pointer; the list below is the keyboard and screen-reader way in
    svg.querySelectorAll('.map-node').forEach((g, i) => g.addEventListener('click', () => onOpenTopic(nodes[i].id)));

    const names = new Map(nodes.map((n) => [n.id, n.topic]));
    const neighbours = (id) => map.links.filter((l) => l.source === id || l.target === id)
      .map((l) => names.get(l.source === id ? l.target : l.source));
    replaceContent(root,
      el('div', { class: 'map-frame' }, svg),
      el('p', { class: 'hint', text: t('map.legend', language) }),
      el('ul', { class: 'map-list' }, nodes.map((n) => {
        const linked = neighbours(n.id);
        return el('li', {},
          el('button', { class: 'link-btn', type: 'button', onclick: () => onOpenTopic(n.id) }, `${n.topic} · ${Math.round(n.mastery)}%`),
          el('span', { class: 'hint', text: linked.length ? t('map.links', language, { list: linked.join(', ') }) : t('map.alone', language) }));
      })));
  }

  store.select(selectConceptMap, draw);
  store.select(selectLanguage, draw);
}
