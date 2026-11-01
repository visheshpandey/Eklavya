// Subjects and mastery wording (pure): the dashboard's topics grouped by notes document, and what a mastery number means.

/** 'strong' (80 and up), 'grow' (60 to 79) or 'low' (under 60), with the word the design uses. */
export function masteryStatus(mastery) {
  if (mastery >= 80) return { key: 'strong', label: 'Strong' };
  if (mastery >= 60) return { key: 'grow', label: 'Growing' };
  return { key: 'low', label: 'Revisit' };
}

/** [{id, name, topics, mastery, weak, weakestTopicId, tone, label}] in the dashboard's order (newest document first), from dashboard.mastery rows. */
export function groupSubjects(mastery = []) {
  const byDoc = new Map();
  for (const row of mastery) {
    if (!byDoc.has(row.document_id)) byDoc.set(row.document_id, { id: row.document_id, name: row.document, rows: [] });
    byDoc.get(row.document_id).rows.push(row);
  }
  return [...byDoc.values()].map(({ id, name, rows }) => {
    const average = Math.round(rows.reduce((sum, r) => sum + r.mastery_score, 0) / rows.length);
    const weakest = [...rows].sort((a, b) => a.mastery_score - b.mastery_score)[0];
    return {
      id, name: String(name ?? '').replace(/\.[a-z0-9]{2,4}$/i, ''), topics: rows.length, mastery: average, weak: rows.filter((r) => r.mastery_score < 60).length,
      weakestTopicId: weakest.topic_id,
      tone: average < 50 ? 'c' : average < 75 ? 'g' : 'b',   // clay, sage, blue: three paper colours for three states
      label: average < 50 ? 'Needs a look' : average < 75 ? 'In motion' : 'Feeling good',
    };
  });
}

/** Two letters for a document's cover tile ("Introduction to ML" -> "IN"). */
export const coverLetters = (name) => String(name ?? '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '··';
