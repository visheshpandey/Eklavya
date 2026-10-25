// Everything about the student's notes: load demo/own notes, refresh the dashboard, open a topic.
// Failures never throw out of here: they are reported through the notifier.
import { actions } from '../state/actions.js';

/**
 * @param {object} deps
 * @param {*} deps.store
 * @param {typeof import('../services/api-client.js').backend} deps.backend
 * @param {ReturnType<typeof import('./notifier.js').createNotifier>} deps.notifier
 * @param {number} deps.userId
 * @param {() => void} deps.endSession stops any running voice session before notes change
 */
export function createNotesController({ store, backend, notifier, userId, endSession }) {
  async function loadDashboard() {
    const dashboard = await backend.dashboard(userId);
    store.dispatch(actions.dashboardLoaded(dashboard));
    await refreshOpenTopic();
    return dashboard;
  }

  /** Keep the open topic card current (mastery, open mistakes) as answers change them. */
  async function refreshOpenTopic() {
    const topicId = store.getState().selectedTopicId;
    if (topicId == null) return;
    try {
      store.dispatch(actions.topicLoaded(await backend.topic(topicId, userId)));
    } catch {
      // the card keeps its last values; the dashboard refresh itself succeeded, so do not raise an error for this
    }
  }

  async function guarded(task) {
    try {
      await task();
      return true;
    } catch (err) {
      notifier.error(err);
      return false;
    }
  }

  return {
    refresh: () => guarded(loadDashboard),

    loadDemo: () => guarded(async () => {
      endSession();
      await backend.seedDemo(userId);
      store.dispatch(actions.notesReset());
      await loadDashboard();
      notifier.success('Demo notes loaded. Tap a topic to start learning.');
    }),

    uploadFile: (file) => guarded(async () => {
      endSession();
      const result = await backend.uploadDocument(file, userId);
      store.dispatch(actions.notesReset());
      await loadDashboard();
      notifier.success(`Found ${result.topics_found.length} topics in ${file.name}. Tap one to start.`);
    }),

    /** Remove one notes document and the progress on its topics. */
    removeDocument: (documentId) => guarded(async () => {
      endSession();
      await backend.deleteDocument(documentId, userId);
      store.dispatch(actions.notesReset());
      await loadDashboard();
      notifier.info('Notes removed.');
    }),

    openTopic: (topicId) => guarded(async () => {
      store.dispatch(actions.topicSelected(topicId));
      store.dispatch(actions.topicLoaded(await backend.topic(topicId, userId)));
    }),
  };
}
