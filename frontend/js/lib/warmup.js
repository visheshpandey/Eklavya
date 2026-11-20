// The free backend sleeps when nobody has used it and takes about a minute to wake. The page asks it to wake the moment it opens:
//   - it calls /api/health in the background; if there is no answer within 3 s, the page says it is waking up (wake-toast.js);
//   - it asks again every 5 s, at most 12 more times; the first {"ok": true} makes the state "ready";
//   - if all of them fail the state is "slow" (the page says so, with a Retry button) and requests are tried anyway.
// Requests wait for "ready" or "slow" (never longer than about 65 s), so nothing fails with a raw error while the server starts.
// Pure logic with injected ping, timers and clock so it can be tested.
import { API_BASE } from './config.js';

export const SHOW_AFTER_MS = 3000;
export const RETRY_MS = 5000;
export const MAX_RETRIES = 12;
export const MESSAGES = {
  waking: 'Waking up Eklavya… this takes about a minute the first time.',
  ready: 'Eklavya is ready',
  slow: 'Eklavya’s server is taking longer than usual. You can still browse your notes. Try again in a minute.',
};

/** One /api/health call that gives up after `timeoutMs` (a sleeping server holds the request open), true only for {"ok": true}. */
export function healthPing({ fetchFn = null, base = API_BASE, timeoutMs = 5000 } = {}) {
  return async () => {
    const call = fetchFn ?? globalThis.fetch?.bind(globalThis);   // looked up at each call, so a replaced fetch is used
    if (!call) return false;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    timer?.unref?.();
    try {
      const response = await call(`${base}/api/health`, { cache: 'no-store', signal: controller?.signal });
      if (!response.ok) return false;
      const body = await response.json().catch(() => null);
      return body !== null && body.ok !== false;   // a JSON answer from the server; an HTML interstitial from the host is not one
    } catch { return false; } finally { clearTimeout(timer); }
  };
}

export function createWarmup({ ping, schedule = (fn, ms) => setTimeout(fn, ms), cancel = (id) => clearTimeout(id),
  showAfterMs = SHOW_AFTER_MS, retryMs = RETRY_MS, maxRetries = MAX_RETRIES } = {}) {
  let state = 'checking';       // checking -> (waking) -> ready | slow
  let run = 0;                  // a Retry starts a new run; the old one stops
  let settle = null;
  let settled = null;
  let wasWaking = false;
  const listeners = new Set();

  const set = (next) => { if (next === state) return; state = next; if (next === 'waking') wasWaking = true; listeners.forEach((fn) => fn(next)); };
  const sleep = (ms) => new Promise((resolve) => schedule(resolve, ms));
  const newSettled = () => { settled = new Promise((resolve) => { settle = resolve; }); };
  newSettled();

  async function start() {
    const mine = ++run;
    let timer = schedule(() => { if (mine === run && state === 'checking') set('waking'); }, showAfterMs);
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (await ping()) {
        if (mine !== run) return;
        cancel(timer);
        set('ready'); settle(); return;
      }
      if (mine !== run) return;
      if (attempt < maxRetries) await sleep(retryMs);
      if (mine !== run) return;
    }
    cancel(timer);
    set('slow'); settle();
  }

  return {
    start,
    state: () => state,
    /** Was the "waking" message ever shown (so "Eklavya is ready" is worth saying)? */
    wasWaking: () => wasWaking,
    /** Resolves when the server answered or the retries ran out; a request waits for this and then goes ahead. */
    settled: () => settled,
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    /** No page to warm up for (tests, scripts): treat the server as ready. */
    markReady() { run++; set('ready'); settle(); },
    /** The Retry button: start over. */
    retry() { if (state !== 'slow') return; state = 'checking'; wasWaking = false; newSettled(); listeners.forEach((fn) => fn(state)); start(); },
  };
}

export const warmup = createWarmup({ ping: healthPing() });
// only a real page asks the server to wake (a test run or a script has no page to show the note on, and must not wait a minute)
if (typeof window !== 'undefined' && typeof document !== 'undefined') warmup.start(); else warmup.markReady();
