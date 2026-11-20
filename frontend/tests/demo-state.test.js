// Demo state belongs to one browser: every visitor gets a private guest before the first call, never the shared demo account; a new demo
// session starts the guided-demo checklist clean; and the numbers shown (answers, mastery, streak) come only from that private guest.
import test from 'node:test';
import assert from 'node:assert/strict';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; }, data };
}

test('a new demo session (a new guest token) clears the guided-demo checklist; the same session keeps it', async () => {
  globalThis.localStorage = memoryStorage({ 'eklavya.guide': JSON.stringify({ open: true, dismissed: true, finished: true, done: { ask: true, talk: true, test: true, progress: true } }) });
  const { saveGuestToken, chooseGuest, signOut, GUIDE_KEY } = await import('../js/lib/session.js');
  const { readGuide, doneCount } = await import('../js/components/guide.js');
  assert.equal(doneCount(readGuide(globalThis.localStorage)), 4);               // an old session's ticks
  saveGuestToken('a-new-private-guest');                                         // a new demo session starts
  const fresh = readGuide(globalThis.localStorage);
  assert.equal(doneCount(fresh), 0);
  assert.deepEqual([fresh.open, fresh.dismissed, fresh.finished], [false, false, false]);
  globalThis.localStorage.setItem(GUIDE_KEY, JSON.stringify({ done: { ask: true } }));
  saveGuestToken(null);                                                          // a cleared guest is not a new session
  assert.equal(doneCount(readGuide(globalThis.localStorage)), 1);
  chooseGuest();                                                                 // "Try the demo" again
  assert.equal(doneCount(readGuide(globalThis.localStorage)), 0);
  globalThis.localStorage.setItem(GUIDE_KEY, JSON.stringify({ done: { talk: true } }));
  signOut();
  assert.equal(doneCount(readGuide(globalThis.localStorage)), 0);
});

test('no call leaves the browser without an identity: a guest is created first, and if that fails the call is refused calmly', async () => {
  globalThis.localStorage = memoryStorage();
  globalThis.window = {}; globalThis.document = {};
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), auth: options.headers?.authorization ?? null });
    if (String(url).endsWith('/api/health')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
    if (String(url).endsWith('/api/guest')) return { ok: false, status: 429, json: async () => ({ error: 'slow down' }) };
    return { ok: true, status: 200, json: async () => ({ mastery: [] }) };
  };
  const { backend } = await import('../js/services/api-client.js');
  const { setGuestRetryMs } = await import('../js/services/api-client.js');
  setGuestRetryMs(0);
  await assert.rejects(backend.dashboard(1), (err) => err.code === 'network' && /taking longer than usual/.test(err.message));
  assert.equal(calls.filter((c) => c.url.includes('/api/guest')).length, 3);     // three tries
  assert.equal(calls.filter((c) => c.url.includes('/api/dashboard')).length, 0); // and the dashboard was never asked for without a token

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), auth: options.headers?.authorization ?? null });
    if (String(url).endsWith('/api/guest')) return { ok: true, status: 200, json: async () => ({ token: 'private-guest' }) };
    return { ok: true, status: 200, json: async () => ({ mastery: [] }) };
  };
  calls.length = 0;
  await backend.dashboard(1);
  const dash = calls.find((c) => c.url.includes('/api/dashboard'));
  assert.equal(dash.auth, 'Bearer private-guest');                               // the call carries the private guest, never "no token"
  assert.equal(globalThis.localStorage.getItem('eklavya.guestToken'), 'private-guest');
  delete globalThis.window; delete globalThis.document;
});
