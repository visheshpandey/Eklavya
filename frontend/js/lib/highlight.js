// Highlighting the words of a question inside a passage (pure): [{text, hit}] pieces to write with textContent / <mark>.

/** Split `text` where it contains one of `terms` (a word and its endings: "gradient" marks "gradients"). */
export function splitByTerms(text, terms) {
  const usable = [...new Set((terms ?? []).map((t) => String(t).toLowerCase()).filter((t) => t.length > 1))];
  if (!usable.length) return [{ text, hit: false }];
  const pattern = new RegExp(`\\b(?:${usable.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\w*`, 'gi');
  const pieces = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) pieces.push({ text: text.slice(last, match.index), hit: false });
    pieces.push({ text: match[0], hit: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last), hit: false });
  return pieces.length ? pieces : [{ text, hit: false }];
}

/** The sentences that mention the most question words, kept in their original order (so a long passage shows its best part). */
export function bestSentences(text, terms, count = 3) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length <= count) return text;
  const wanted = (terms ?? []).map((t) => String(t).toLowerCase());
  const scored = sentences.map((sentence, index) => ({ index, sentence, score: wanted.filter((t) => sentence.toLowerCase().includes(t)).length }));
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, count).sort((a, b) => a.index - b.index).map((s) => s.sentence).join(' ');
}
