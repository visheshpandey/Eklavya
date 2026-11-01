// The big mastery ring on Progress: the average mastery across all topics as a circle that fills. The component only draws the finished ring;
// the motion layer animates it from empty when it comes into view (the ring is fully readable without it).
import { svgEl } from '../lib/dom.js';
import { selectDashboard } from '../state/selectors.js';

const RADIUS = 44;
export const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
export const ringColor = (percent) => (percent < 50 ? 'var(--terracotta)' : percent < 70 ? 'var(--ochre)' : 'var(--ok-fill)');

export function mountMasteryRing({ store, root }) {
  function draw() {
    const mastery = selectDashboard(store.getState())?.mastery ?? [];
    const percent = mastery.length ? Math.round(mastery.reduce((sum, row) => sum + row.mastery_score, 0) / mastery.length) : 0;
    root.replaceChildren(svgEl('svg', { viewBox: '0 0 120 120', class: 'mring-svg', role: 'img', 'aria-label': `Average mastery ${percent}%` },
      svgEl('circle', { class: 'bg', cx: 60, cy: 60, r: RADIUS, fill: 'none', 'stroke-width': 9 }),
      svgEl('circle', { class: 'fg', cx: 60, cy: 60, r: RADIUS, fill: 'none', 'stroke-width': 9, 'stroke-linecap': 'round', transform: 'rotate(-90 60 60)',
        style: `stroke:${ringColor(percent)};stroke-dasharray:${CIRCUMFERENCE.toFixed(2)};stroke-dashoffset:${(CIRCUMFERENCE * (1 - percent / 100)).toFixed(2)}`, 'data-circ': CIRCUMFERENCE.toFixed(2) }),
      svgEl('text', { class: 'mring-num', x: 60, y: 64, 'text-anchor': 'middle' }, `${percent}%`),
      svgEl('text', { class: 'mring-cap', x: 60, y: 82, 'text-anchor': 'middle' }, 'MASTERY')));
  }
  store.select(selectDashboard, draw);
  draw();
}
