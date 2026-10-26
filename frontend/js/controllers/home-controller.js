// Data for the Today screen, the exam planner, the concept map, flashcards and past results.
// Like the notes controller: talks to the backend, dispatches what came back, reports failures through the notifier.
import { actions } from '../state/actions.js';
import { t } from '../lib/strings.js';

/**
 * @param {object} deps
 * @param {*} deps.store
 * @param {typeof import('../services/api-client.js').backend} deps.backend
 * @param {ReturnType<typeof import('./notifier.js').createNotifier>} deps.notifier
 * @param {number} deps.userId
 */
export function createHomeController({ store, backend, notifier, userId }) {
  let celebrationId = 0;
  const language = () => store.getState().ui.language;

  async function guarded(task) {
    try {
      await task();
      return true;
    } catch (err) {
      notifier.error(err);
      return false;
    }
  }

  /** A quiet refresh: background data that should not raise a banner every time the backend is briefly away. */
  async function quietly(task) {
    try { await task(); } catch { /* the screen keeps its last data */ }
  }

  async function loadToday() {
    const before = store.getState().today?.streak ?? null;
    const today = await backend.today(userId);
    store.dispatch(actions.todayLoaded(today));
    if (before !== null && today.streak > before && today.streak >= 2) {
      store.dispatch(actions.celebrated({ id: ++celebrationId, text: t('celebrate.streak', language(), { n: today.streak }) }));
    }
  }

  const loadPlan = async () => store.dispatch(actions.planLoaded(await backend.plan(userId)));
  const loadMap = async () => store.dispatch(actions.conceptMapLoaded(await backend.conceptMap(userId)));
  const loadHistory = async () => store.dispatch(actions.historyLoaded(await backend.history(userId)));

  return {
    /** Everything on the Today and Progress screens that depends on answers and notes. */
    refresh: () => quietly(() => Promise.all([loadToday(), loadPlan(), loadMap(), loadHistory()])),
    refreshToday: () => quietly(loadToday),

    savePlan: (examDate, minutesPerDay) => guarded(async () => {
      store.dispatch(actions.planLoaded(await backend.savePlan(examDate, minutesPerDay, userId)));
      await loadToday();
    }),
    clearPlan: () => guarded(async () => {
      store.dispatch(actions.planLoaded(await backend.clearPlan(userId)));
      await loadToday();
    }),

    loadFlashcards: (topicId) => quietly(async () => {
      const { cards } = await backend.flashcards(topicId, userId);
      store.dispatch(actions.flashcardsLoaded({ topicId, cards }));
    }),
    makeFlashcards: (topicId) => guarded(async () => {
      const { cards } = await backend.makeFlashcards(topicId, userId);
      store.dispatch(actions.flashcardsLoaded({ topicId, cards }));
    }),
  };
}
