// The free backend sleeps when nobody has used it and takes up to a minute to wake. The page asks for it to wake the moment it opens, every request
// waits for that (so nothing fails while it starts), and a friendly card covers the wait (wake-banner.js).
import { API_BASE } from './config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const GIVE_UP_MS = 150000;
const listeners = new Set();
let state = 'waking';
let startedAt = Date.now();

async function ping() {
  try { return (await fetch(`${API_BASE}/api/health`, { cache: 'no-store' })).ok; } catch { return false; }
}

/** Resolves once the backend answers (or after GIVE_UP_MS, so a backend that is really down still shows its errors). */
export const ready = (async () => {
  startedAt = Date.now();
  while (Date.now() - startedAt < GIVE_UP_MS) {
    if (await ping()) break;
    await sleep(2000);
  }
  state = 'ready';
  listeners.forEach((listener) => listener(state));
})();

export const warmup = {
  state: () => state,
  elapsed: () => Date.now() - startedAt,
  onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
};
