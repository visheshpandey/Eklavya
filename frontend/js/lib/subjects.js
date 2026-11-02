// Subjects and mastery wording (pure): the dashboard's topics grouped by notes document, and what a mastery number means.

/** 'strong' (80 and up), 'grow' (60 to 79) or 'low' (under 60), with the word the design uses. */
export function masteryStatus(mastery) {
  if (mastery >= 80) return { key: 'strong', label: 'Strong' };
  if (mastery >= 60) return { key: 'grow', label: 'Growing' };
  return { key: 'low', label: 'Revisit' };
}

/** [{id, name, kind, topics, started, mastery, weak, weakestTopicId, tone, label}] in the dashboard's order (newest document first), from dashboard.mastery rows.
 *  `mastery` averages only the topics that have started; it is null (shown as "Not started") when none has. */
export function groupSubjects(mastery = []) {
  const byDoc = new Map();
  for (const row of mastery) {
    if (!byDoc.has(row.document_id)) byDoc.set(row.document_id, { id: row.document_id, name: row.document, kind: row.source_kind ?? 'text', rows: [] });
    byDoc.get(row.document_id).rows.push(row);
  }
  return [...byDoc.values()].map(({ id, name, kind, rows }) => {
    const started = rows.filter((r) => r.started !== false);
    const average = started.length ? Math.round(started.reduce((sum, r) => sum + r.mastery_score, 0) / started.length) : null;
    const weakest = [...(started.length ? started : rows)].sort((a, b) => a.mastery_score - b.mastery_score)[0];
    return {
      id, kind, name: String(name ?? '').replace(/\.[a-z0-9]{2,4}$/i, ''), topics: rows.length, started: started.length, mastery: average, weak: started.filter((r) => r.mastery_score < 60).length,
      weakestTopicId: weakest.topic_id,
      tone: average === null ? 'n' : average < 50 ? 'c' : average < 75 ? 'g' : 'b',   // paper, clay, sage, blue: four paper colours for four states
      label: average === null ? 'Not started' : average < 50 ? 'Needs a look' : average < 75 ? 'In motion' : 'Feeling good',
    };
  });
}

/** "Software: Process scheduling" -> {subject: "Software", topic: "Process scheduling"}; a name with no short prefix has no subject. */
export function splitSubject(name) {
  const match = /^([^:]{2,40}):\s+(\S.*)$/.exec(String(name ?? '').trim());
  return match ? { subject: match[1].trim(), topic: match[2].trim() } : { subject: null, topic: String(name ?? '').trim() };
}

/** A day's plan items grouped by subject, in order of first appearance: [{subject, items: [{...item, shortTopic}]}]. */
export function groupBySubject(items = []) {
  const groups = new Map();
  for (const item of items) {
    const { subject, topic } = splitSubject(item.topic);
    const key = subject ?? '';
    if (!groups.has(key)) groups.set(key, { subject, items: [] });
    groups.get(key).items.push({ ...item, shortTopic: topic });
  }
  return [...groups.values()];
}

/** Two letters for a document's cover tile ("Introduction to ML" -> "IN"). */
export const coverLetters = (name) => String(name ?? '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '··';
