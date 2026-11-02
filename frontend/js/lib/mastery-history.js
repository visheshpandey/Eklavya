// How each topic's mastery moved over time (the sparklines): loaded from /api/mastery-history, kept here, and announced with an event so every screen redraws.
let topics = {};

export const masteryHistory = {
  set(next) { topics = next ?? {}; document.dispatchEvent(new CustomEvent('eklavya:mastery-history')); },
  /** [0-100, ...] oldest first for one topic (empty if it has no history). */
  values: (topicId) => (topics[topicId] ?? []).map((point) => point.after),
};
