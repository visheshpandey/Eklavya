// A first-time visitor (a judge) meets ONE thing at a time, in this order:
//   1. the login dialog, with "Try the demo" first (only if they have not chosen yet);
//   2. a short tour (5 steps, skippable), once, on Today, with the welcome and the "What is Eklavya?" strip behind it;
//   3. the welcome buttons: "Try the demo notes" loads the demo, lands in the Study room on a topic, and docks the guided demo as a small pill.
// This file holds the pure decisions, so they can be tested.

export const TOUR_KEY = 'eklavya.tour.done';

export function tourSeen(storage = globalThis.localStorage) {
  try { return storage.getItem(TOUR_KEY) === '1'; } catch { return true; }   // storage blocked: never nag
}
export function markTourSeen(storage = globalThis.localStorage) {
  try { storage.setItem(TOUR_KEY, '1'); } catch { /* the tour may offer itself again next visit */ }
}

/**
 * Should the tour start by itself? Only for someone who has chosen how to use the app, has not seen the tour,
 * did not arrive by a link to a particular screen, and is not about to get another first-run dialog.
 */
export function shouldAutoTour({ seen, needsLogin, arrivedByLink, onboardingPending, reduceMotion = false }) {
  return !seen && !needsLogin && !arrivedByLink && !onboardingPending && !reduceMotion;
}

/** The topic the demo lands on: Precision (the topic the guided demo asks about), else the first one. */
export function pickDemoTopic(topics) {
  const list = topics ?? [];
  return list.find((topic) => topic.topic_name === 'Precision') ?? list[0] ?? null;
}

export function demoLoadedMessage(topicName) {
  return topicName
    ? `Demo loaded. You are on ${topicName}: tap Learn to hear it taught, or Test to be quizzed.`
    : 'Demo loaded. Pick a topic, then tap Learn to start.';
}

/** The five tour steps (wording from the judge-readiness brief). Targets are CSS selectors; `fallback` is used when the first is not on the page. */
export const TOUR_STEPS = [
  { view: 'library', target: '#drop', title: 'Add your notes', text: 'PDF, photo or text, even just a syllabus. Eklavya finds every topic.' },
  { view: 'study', target: '#mentorFrame', title: 'Study room', text: 'Eklavya teaches you by voice in English, Hindi or Hinglish. You can also type in the chat.' },
  { view: 'ask', target: '#askForm', fallback: '#askChat', title: 'Ask', text: 'Every answer shows the exact passage from your notes.' },
  { view: 'flashcards', target: '.fcstage', fallback: '#fcReview', title: 'Flashcards and Progress', text: 'A forgetting curve decides what you revise next, and your mastery moves with every card.' },
  { view: 'today', target: '#behindScenes', title: 'Behind the scenes', text: 'See what each AI agent decided and why.' },
];
