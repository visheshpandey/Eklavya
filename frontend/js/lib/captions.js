// The captions choice is remembered in this browser. Captions are ON until the student turns them off:
// a judge with the sound off, or a student on a bus, should see what Eklavya says without having to find a button.
const KEY = 'eklavya.captions';

/** Saved choice: true unless the student switched captions off. Never throws (storage can be blocked). */
export function loadCaptions(storage = globalThis.localStorage) {
  try { return storage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function saveCaptions(on, storage = globalThis.localStorage) {
  try { storage.setItem(KEY, on ? 'on' : 'off'); } catch { /* not remembered, still applied */ }
}
