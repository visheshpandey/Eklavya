// Layout of the 2D concept map (pure, so it can be tested): topics on an ellipse as wide as the card, and every name written horizontally
// beside or below its circle on at most two lines, never cut, never rotated, and never on top of another name or circle.

export const CHAR_W = 7.6;    // width of one character of 13px type, a little generous
export const LINE_H = 16;     // height of one line of a name
export const LABEL_GAP = 8;   // between a circle and its name
const PAD = 4;                // clear space kept around every name

/**
 * A name broken at spaces into at most `maxLines` lines, WITHOUT cutting anything: the line width grows until the whole name fits
 * (so a very long name gets two long lines instead of "…"). `minPer` is the narrowest line tried.
 */
export function wrapFull(text, maxLines = 2, minPer = 14) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const widest = Math.max(minPer, ...words.map((w) => w.length));
  for (let per = Math.max(minPer, widest); per <= String(text).length + 1; per++) {
    const lines = [];
    let current = '';
    for (const word of words) {
      if (current && `${current} ${word}`.length > per) { lines.push(current); current = word; } else current = current ? `${current} ${word}` : word;
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines) return lines;
  }
  return [words.join(' ')];
}

/** The size of a name's box. */
export const labelBox = (lines) => ({ w: Math.ceil(Math.max(0, ...lines.map((l) => l.length)) * CHAR_W), h: lines.length * LINE_H });

/** Canvas size and ellipse for `count` topics in a card `width` pixels wide (1 unit = 1 pixel, so the type stays 13px). */
export function mapCanvas(count, width, longest = 20) {
  const nodeRadius = 16;
  const W = Math.max(480, Math.floor(width));
  const H = count <= 6 ? 460 : Math.min(1000, Math.max(560, 54 * count));
  const labelRoom = Math.min(Math.ceil(longest * CHAR_W), Math.floor(W * 0.34));   // beside the circles on the left and right
  const rx = Math.max(80, W / 2 - labelRoom - nodeRadius - 16);
  const ry = Math.max(100, H / 2 - nodeRadius - 2 * LINE_H - 16);                    // room above and below for names there
  return { W, H, rx, ry, nodeRadius };
}

/** Positions on the ellipse, starting at the top and going round, in the order given (topics of one document stay together). */
export function ellipseLayout(count, { W, H, rx, ry }) {
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, count);
    return { x: W / 2 + rx * Math.cos(angle), y: H / 2 + ry * Math.sin(angle), angle };
  });
}

const overlap = (a, b) => a.l < b.r + PAD && b.l < a.r + PAD && a.t < b.b + PAD && b.t < a.b + PAD;
const toBox = (cx, cy, w, h, anchor) => {
  const l = anchor === 'start' ? cx : anchor === 'end' ? cx - w : cx - w / 2;
  return { l, r: l + w, t: cy - h / 2, b: cy + h / 2 };
};

/**
 * Where each name goes. `points` are circle centres {x, y, angle}; `lines` the wrapped names. A name sits to the right or left of its circle
 * (or above or below it at the top and bottom of the ellipse); names that would touch another name or a circle are moved up or down until
 * they do not. Returns [{x, y, anchor, lines, box}] where (x, y) is the anchor point and the centre of the block.
 */
export function placeLabels(points, lines, { W, H, nodeRadius = 16 }) {
  const items = points.map((p, i) => {
    const { w, h } = labelBox(lines[i]);
    const c = Math.cos(p.angle), s = Math.sin(p.angle);
    let anchor = 'middle', x = p.x, y = p.y;
    if (c > 0.2) { anchor = 'start'; x = p.x + nodeRadius + LABEL_GAP; }
    else if (c < -0.2) { anchor = 'end'; x = p.x - nodeRadius - LABEL_GAP; }
    else if (s < 0) y = p.y - nodeRadius - LABEL_GAP - h / 2;
    else y = p.y + nodeRadius + LABEL_GAP + h / 2;
    // keep inside the picture sideways
    const box0 = toBox(x, y, w, h, anchor);
    if (box0.l < PAD) x += PAD - box0.l;
    if (box0.r > W - PAD) x -= box0.r - (W - PAD);
    return { x, y, anchor, lines: lines[i], w, h };
  });
  const circles = points.map((p) => ({ l: p.x - nodeRadius, r: p.x + nodeRadius, t: p.y - nodeRadius, b: p.y + nodeRadius }));
  const boxOf = (it) => toBox(it.x, it.y, it.w, it.h, it.anchor);

  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      const a = boxOf(items[i]);
      const hits = [
        ...items.flatMap((other, j) => (j !== i ? [boxOf(other)] : [])),
        ...circles.filter((_, j) => j !== i),
      ].filter((b) => overlap(a, b));
      if (!hits.length) continue;
      const mid = (a.t + a.b) / 2;
      const down = hits.reduce((sum, b) => sum + (mid >= (b.t + b.b) / 2 ? 1 : -1), 0) >= 0;
      items[i].y += down ? 6 : -6;               // step away from what it touches
      items[i].y = Math.min(H - items[i].h / 2 - PAD, Math.max(items[i].h / 2 + PAD, items[i].y));
      moved = true;
    }
    if (!moved) break;
  }
  return items.map((it) => ({ x: it.x, y: it.y, anchor: it.anchor, lines: it.lines, box: boxOf(it) }));
}

/** Do any two name boxes (or a name and a circle) overlap? For tests and a final check. */
export function hasCollision(placed, points, nodeRadius = 16) {
  const circles = points.map((p) => ({ l: p.x - nodeRadius, r: p.x + nodeRadius, t: p.y - nodeRadius, b: p.y + nodeRadius }));
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i].box;
    for (let j = i + 1; j < placed.length; j++) if (a.l < placed[j].box.r && placed[j].box.l < a.r && a.t < placed[j].box.b && placed[j].box.t < a.b) return true;
    for (const c of circles) if (a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b) return true;
  }
  return false;
}
