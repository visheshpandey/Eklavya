// Which topics of the 3D concept map carry a name all the time, and where a subject's own title goes. Pure (no three.js), so it can be tested.

/**
 * The topics that always show their name: the biggest spheres (the topics built from the most notes), at most `perSubject` of
 * each subject so the names spread across the map instead of piling up in one cluster, and at most `max` in all.
 * Ties go to the weakest started topic (the one worth a look), then to the order given. Every other topic shows its name on hover or tap.
 * @param {{id: number, notes?: number, mastery?: number, started?: boolean, subject?: string}[]} nodes
 */
export function permanentLabelIds(nodes, { max = 6, perSubject = 2 } = {}) {
  const ranked = nodes.map((node, index) => ({ node, index })).sort((a, b) =>
    (b.node.notes ?? 1) - (a.node.notes ?? 1)
    || (a.node.started === false) - (b.node.started === false)
    || (a.node.mastery ?? 0) - (b.node.mastery ?? 0)
    || a.index - b.index);
  const perSubjectCount = new Map();
  const chosen = [];
  for (const { node } of ranked) {
    if (chosen.length >= max) break;
    const subject = node.subject ?? 'Notes';
    if ((perSubjectCount.get(subject) ?? 0) >= perSubject) continue;
    perSubjectCount.set(subject, (perSubjectCount.get(subject) ?? 0) + 1);
    chosen.push(node.id);
  }
  return chosen;
}

/**
 * Where a subject's title sits: centred over its topics and above the highest sphere (plus room for that sphere's own name),
 * so a title never lands on top of a dot. `spheres` are {x, y, z, r} in world units.
 */
export function subjectLabelSpot(spheres, rise = 26) {
  if (!spheres.length) return null;
  const mean = (key) => spheres.reduce((sum, s) => sum + s[key], 0) / spheres.length;
  return { x: mean('x'), y: Math.max(...spheres.map((s) => s.y + s.r)) + rise, z: mean('z') };
}

/**
 * Which name tags can show without lying on top of each other (pure). `items` are screen boxes {id, x, y, w, h} (centre x and y, width, height)
 * in priority order; `forced` ids (the hovered and the selected topic) always show and are placed first. Any other tag that would overlap a
 * tag already placed is left out until the camera or the layout moves it clear.
 * @returns {Set<number>} the ids that may show
 */
export function visibleLabelIds(items, forced = []) {
  const forcedSet = new Set(forced);
  const ordered = [...items.filter((item) => forcedSet.has(item.id)), ...items.filter((item) => !forcedSet.has(item.id))];
  const placed = [];
  const shown = new Set();
  const overlaps = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
  for (const item of ordered) {
    if (forcedSet.has(item.id) || !placed.some((other) => overlaps(item, other))) {
      placed.push(item);
      shown.add(item.id);
    }
  }
  return shown;
}
