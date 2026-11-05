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

/** The ring angle that puts topic `index` in front, reached by the shortest turn from the current angle (never the long way round). */
export function angleToFront(index, count, current = 0) {
  const wanted = -index * (360 / Math.max(count, 1));
  const delta = ((((wanted - current) % 360) + 540) % 360) - 180;
  return current + delta;
}

/** One frame of turning toward `target`: a share of the remaining distance, landing exactly when close. `dt` is in milliseconds. */
export function easeAngle(current, target, dt) {
  const diff = target - current;
  return Math.abs(diff) < 0.2 ? target : current + diff * Math.min(1, dt * 0.012);
}

/** The topics on the ring: the weakest first, at most `max`, and always the picked topic, even if it is not among the weakest. */
export function pickChoices(mastery, selectedId, max) {
  const all = [...(mastery ?? [])].sort((a, b) => a.mastery_score - b.mastery_score);
  const list = all.slice(0, max);
  if (selectedId == null || list.some((t) => t.topic_id === selectedId)) return list;
  const picked = all.find((t) => t.topic_id === selectedId);
  return picked ? [...list.slice(0, max - 1), picked] : list;
}

export const orbitRadius = (width) => Math.min(190, width * 0.3);

/** Arrow keys turn the ring one topic at a time. */
export const turnBy = (count, key) => (key === 'ArrowLeft' ? 360 / Math.max(count, 1) : key === 'ArrowRight' ? -360 / Math.max(count, 1) : 0);

/** The one line above the mode cards: how to start. Names the picked topic, or the weakest one when nothing is picked. Pure. */
export function helpLine({ selectedName = '', weakestName = '' } = {}) {
  if (selectedName) return `Pick how you want to study ${selectedName}. Then talk, or type in the chat.`;
  if (weakestName) return `Pick how you want to study ${weakestName} (your weakest topic), or turn the ring above to choose another. Then talk, or type in the chat.`;
  return 'Just talk to Eklavya, or add notes to study a topic.';
}

/** The little label on a topic card. */
export function orbitTag(mastery, isWeakest) {
  if (isWeakest) return 'Start here';
  if (mastery < 60) return 'Revisit';
  if (mastery >= 80) return 'Strong';
  return 'Growing';
}
