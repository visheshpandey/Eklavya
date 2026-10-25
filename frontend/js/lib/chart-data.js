// Turns quiz attempts into line-chart series. Pure: no DOM, easy to test.
//
// Rows come from GET /api/dashboard `progress` (oldest first):
//   {attempt_id, topic_id, topic_name, mastery_before, mastery_after, is_correct, answered_at}
// The x axis is the answer number across ALL topics (1, 2, 3 ...), so topics practised in turn interleave honestly.
// Each topic's line starts at the mastery it had BEFORE its first answer, so the first answer already shows a step.

export const MAX_SERIES = 4;   // the validated categorical palette has 4 slots that are safe beside each other

/**
 * @param {Array<object>} rows attempts, oldest first
 * @returns {{series: Array<{topicId:number, name:string, other:boolean, points:Array<{x:number,y:number,correct:boolean|null}>}>,
 *            xMax:number, answers:number, hiddenTopics:number}}
 */
export function buildSeries(rows) {
  const attempts = (rows ?? []).filter((r) => Number.isFinite(r.mastery_after));
  const byTopic = new Map();
  attempts.forEach((r, i) => {
    const x = i + 1;
    if (!byTopic.has(r.topic_id)) {
      byTopic.set(r.topic_id, { topicId: r.topic_id, name: r.topic_name, lastX: x,
        points: [{ x: x - 1, y: r.mastery_before ?? r.mastery_after, correct: null }] });   // the starting value
    }
    const topic = byTopic.get(r.topic_id);
    topic.points.push({ x, y: r.mastery_after, correct: Boolean(r.is_correct) });
    topic.lastX = x;
  });

  // keep the topics practised most recently; fold the rest into one muted "other" series is NOT done here:
  // a series per topic is cheap, but colours are scarce, so the chart paints only the first MAX_SERIES in colour.
  const ordered = [...byTopic.values()].sort((a, b) => b.lastX - a.lastX);
  const series = ordered.map((t, i) => ({ topicId: t.topicId, name: t.name, other: i >= MAX_SERIES, points: t.points }));
  return { series, xMax: Math.max(attempts.length, 1), answers: attempts.length, hiddenTopics: Math.max(series.length - MAX_SERIES, 0) };
}

/** The series values at answer number `x` (a topic that was not answered at x holds its previous value). */
export function valuesAt(series, x) {
  return series.map((s) => {
    let value = null;
    for (const p of s.points) if (p.x <= x) value = p; else break;
    return { topicId: s.topicId, name: s.name, other: s.other, value: value ? value.y : null, answeredNow: s.points.some((p) => p.x === x && p.correct !== null) };
  });
}
