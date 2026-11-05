// Default timers for the small controllers. Under Node (the tests) a pending timer must not keep the process alive, so it is unref'd;
// in a browser setTimeout returns a number and this is plain setTimeout.
export const schedule = (fn, ms) => {
  const id = setTimeout(fn, ms);
  id?.unref?.();
  return id;
};
export const cancel = (id) => clearTimeout(id);
