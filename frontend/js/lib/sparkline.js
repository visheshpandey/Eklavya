// A tiny line of how a topic's mastery moved (pure path maths, plus one function that draws it as SVG).
import { svgEl } from './dom.js';

/** Points (0-100 values, oldest first) as an SVG path "M x y L x y ..." inside a width x height box, with `pad` around it. */
export function sparklinePath(values, width = 72, height = 22, pad = 2) {
  if (!values.length) return '';
  const step = values.length > 1 ? (width - 2 * pad) / (values.length - 1) : 0;
  return values.map((value, i) => {
    const x = values.length > 1 ? pad + i * step : width / 2;
    const y = pad + (1 - Math.min(Math.max(value, 0), 100) / 100) * (height - 2 * pad);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

/** The sparkline as an element, coloured by where it ends (the mastery scale), or null when there is nothing to draw. */
export function sparkline(values, { width = 72, height = 22 } = {}) {
  if (values.length < 2) return null;
  const last = values.at(-1);
  const color = last < 60 ? 'var(--terracotta)' : last < 80 ? 'var(--ochre)' : 'var(--ok-fill)';
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'spark', role: 'img', 'aria-label': `Mastery went from ${Math.round(values[0])}% to ${Math.round(last)}%` },
    svgEl('path', { d: sparklinePath(values, width, height), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    svgEl('circle', { cx: values.length > 1 ? width - 2 : width / 2, cy: 2 + (1 - Math.min(Math.max(last, 0), 100) / 100) * (height - 4), r: 2.4, fill: color }));
  return svg;
}
