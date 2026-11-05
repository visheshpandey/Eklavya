// The label on an Ask answer: how well the student's notes cover the question. Pure, so the wording can be tested.
// "strong" is green and says plainly where the answer comes from; "partial" and "none" are amber and carry a tooltip that says what they mean.
const LABELS = {
  strong: { text: 'From your notes', tone: '', tip: 'The passages below cover your question, so this answer comes from your own notes.' },
  partial: { text: 'Partial match', tone: ' partial', tip: 'Your notes cover only part of this question. Check the passages below, or add the chapter that explains the rest.' },
  none: { text: 'Not in your notes', tone: ' partial', tip: 'Nothing in your notes matches this question. Try other words, or add the notes that cover it.' },
};

export const matchLabel = (match) => LABELS[match] ?? LABELS.partial;
