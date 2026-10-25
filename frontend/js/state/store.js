// A minimal state container: one state object, changed only by dispatching actions through a reducer.
// UI components never mutate state; they subscribe to a slice and re-render when it changes.

/**
 * @template S
 * @param {(state: S, action: {type: string}) => S} reducer pure function returning the next state
 * @param {S} initialState
 */
export function createStore(reducer, initialState) {
  let state = initialState;
  const listeners = new Set();

  const getState = () => state;

  function dispatch(action) {
    const next = reducer(state, action);
    if (next === state) return;                 // nothing changed, nobody is notified
    state = next;
    for (const listener of [...listeners]) {
      try { listener(state, action); }
      catch (err) { console.error('A state listener failed; the others still run:', err); }
    }
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /** Call `render(slice)` now, then again only when the selected slice changes identity. Returns an unsubscribe. */
  function select(selector, render) {
    let last = selector(state);
    render(last);
    return subscribe((next) => {
      const slice = selector(next);
      if (!Object.is(slice, last)) { last = slice; render(slice); }
    });
  }

  return { getState, dispatch, subscribe, select };
}
