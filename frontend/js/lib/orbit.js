// Geometry of the topic orbit (pure): where each topic sits on the turning ring and which one faces the student.

/** One entry per topic: its angle, whether it is behind the ring (hidden and not focusable) and how opaque it is. */
export function orbitPositions(count, angle = 0) {
  return Array.from({ length: count }, (_, index) => {
    const degrees = index * (360 / Math.max(count, 1)) + angle;
    const cos = Math.cos((degrees * Math.PI) / 180);
    const back = cos < 0.15;
    return { index, degrees, cos, back, opacity: back ? 0 : +(0.45 + 0.55 * cos).toFixed(2) };
  });
}

/** The topic facing the student (largest cosine). -1 when there are none. */
export function frontIndex(count, angle = 0) {
  let best = -1, bestCos = -2;
  orbitPositions(count, angle).forEach((p) => { if (p.cos > bestCos) { best = p.index; bestCos = p.cos; } });
  return best;
}

export const orbitRadius = (width) => Math.min(190, width * 0.3);

/** Arrow keys turn the ring one topic at a time. */
export const turnBy = (count, key) => (key === 'ArrowLeft' ? 360 / Math.max(count, 1) : key === 'ArrowRight' ? -360 / Math.max(count, 1) : 0);

/** The little label on a topic card. */
export function orbitTag(mastery, isWeakest) {
  if (isWeakest) return 'Start here';
  if (mastery < 60) return 'Revisit';
  if (mastery >= 80) return 'Strong';
  return 'Growing';
}
