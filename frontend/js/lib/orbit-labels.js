// Where the friends' name labels go on the study-group orbit (pure, so it is tested without WebGL). Each label sits above its sphere;
// when that would cover the book or a label already placed, it goes below the sphere instead, and it always stays inside the picture.

const GAP = 6;   // px between a sphere and its label

const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const rect = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h });

/**
 * @param {{x: number, y: number, r: number, w: number, h: number}[]} items  sphere centre and radius on screen (px), label width and height
 * @param {{left: number, top: number, right: number, bottom: number}|null} avoid  the book's box on screen
 * @param {{width: number, height: number}} bounds  the picture's size
 * @returns {{left: number, top: number, below: boolean}[]} in the same order as `items`
 */
export function placeLabels(items, avoid, bounds) {
  const placed = [];
  const order = items.map((item, index) => ({ item, index })).sort((a, b) => a.item.y - b.item.y);   // the highest spheres first
  const out = new Array(items.length);
  for (const { item, index } of order) {
    const left = Math.min(Math.max(item.x - item.w / 2, 0), Math.max(0, bounds.width - item.w));
    const clampTop = (top) => Math.min(Math.max(top, 0), Math.max(0, bounds.height - item.h));
    const above = rect(left, clampTop(item.y - item.r - GAP - item.h), item.w, item.h);
    const below = rect(left, clampTop(item.y + item.r + GAP), item.w, item.h);
    const cost = (box) => (avoid ? overlap(box, avoid) : 0) + placed.reduce((sum, other) => sum + overlap(box, other), 0);
    const useBelow = cost(above) > 0 && cost(below) < cost(above);
    const box = useBelow ? below : above;
    placed.push(box);
    out[index] = { left: Math.round(box.left), top: Math.round(box.top), below: useBelow };
  }
  return out;
}
