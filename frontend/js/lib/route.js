// Today's route: three steps (recall, understand a concept, review cards), built from the real plan and remembered per day (pure).

export const ROUTE_KEYS = ['recall', 'concept', 'cards'];
const STORE_KEY = 'eklavya.route';

const weakestOf = (mastery) => [...mastery].sort((a, b) => a.mastery_score - b.mastery_score)[0] ?? null;

/**
 * @param {{plan?: object[], due?: object[], mastery?: object[], cardsDue?: number}} data  Today's plan and due topics, the dashboard's topics, cards due
 * @returns {{key: string, title: string, sub: string, minutes: number, action: object|null}[]}
 *   action is {type:'session', mode, topicId} or {type:'cards'}, or null when there is nothing to do for that step.
 */
export function buildRoute({ plan = [], due = [], mastery = [], cardsDue = 0 }) {
  const revise = plan.find((item) => item.kind === 'revise') ?? (due[0] ? { topic_id: due[0].topic_id, topic: due[0].topic, minutes: 5 } : null);
  const weakest = weakestOf(mastery);
  const learn = plan.find((item) => item.kind === 'learn' || item.kind === 'test')
    ?? (weakest ? { topic_id: weakest.topic_id, topic: weakest.topic_name, minutes: 12 } : null);
  return [
    { key: 'recall', title: 'Quick recall', sub: revise ? revise.topic : 'Nothing is due for revision', minutes: revise?.minutes ?? 5,
      action: revise ? { type: 'session', mode: 'revise', topicId: revise.topic_id } : null },
    { key: 'concept', title: 'Understand a concept', sub: learn ? `${learn.topic}, in a voice session` : 'Add notes to start', minutes: learn?.minutes ?? 12,
      action: learn ? { type: 'session', mode: learn.kind === 'test' ? 'test' : 'learn', topicId: learn.topic_id } : null },
    { key: 'cards', title: 'Review flashcards', sub: cardsDue ? `${cardsDue} card${cardsDue === 1 ? '' : 's'} due today` : 'No cards due',
      minutes: Math.min(10, Math.max(2, Math.ceil(cardsDue * 0.5))), action: { type: 'cards' } },   // about half a minute a card, never a long block
  ];
}

/** {done, percent, label, current}: how far along the three steps are; current is the first one still open. */
export function routeProgress(done = {}) {
  const finished = ROUTE_KEYS.filter((key) => done[key]).length;
  return {
    done: finished, percent: Math.round((finished / ROUTE_KEYS.length) * 100),
    label: finished === ROUTE_KEYS.length ? 'All 3 steps done. Nice work.' : `${finished} of 3 steps done`,
    current: ROUTE_KEYS.find((key) => !done[key]) ?? null,
  };
}

/** Which steps were finished on `day` ("YYYY-MM-DD"); a new day starts empty. `storage` is localStorage (or anything with get/setItem). */
export function loadRouteDone(storage, day) {
  try {
    const saved = JSON.parse(storage.getItem(STORE_KEY) ?? 'null');
    return saved?.day === day ? Object.fromEntries(ROUTE_KEYS.map((key) => [key, Boolean(saved.done?.[key])])) : {};
  } catch { return {}; }
}

export function saveRouteDone(storage, day, done) {
  try { storage.setItem(STORE_KEY, JSON.stringify({ day, done })); } catch { /* not remembered, still shown for this visit */ }
}
