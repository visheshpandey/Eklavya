// User-visible feedback: toasts, and the red banner for errors. Everything goes through the store.
import { actions } from '../state/actions.js';

/** Turn any thrown value into one readable sentence. ApiError messages already come from the backend. */
export function describeError(err) {
  if (err && typeof err.message === 'string' && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}

/**
 * @param {ReturnType<typeof import('../state/store.js').createStore>} store
 * @param {{ttlMs?: number, schedule?: (fn: () => void, ms: number) => unknown}} [options] injectable for tests
 */
export function createNotifier(store, { ttlMs = 6000, schedule = setTimeout } = {}) {
  let nextId = 0;

  function toast(kind, text) {
    const id = ++nextId;
    store.dispatch(actions.toastAdded({ id, kind, text }));
    schedule(() => store.dispatch(actions.toastRemoved(id)), ttlMs);
  }

  return {
    toast,
    info: (text) => toast('info', text),
    success: (text) => toast('ok', text),
    /** Show a failure as a toast and keep it in the banner until the next action clears it. */
    error(err) {
      const message = describeError(err);
      store.dispatch(actions.bannerSet(message));
      toast('bad', message);
      return message;
    },
  };
}
