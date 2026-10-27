import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}

test('a fresh visitor must choose; signing in or picking the demo ends the choice', async () => {
  globalThis.localStorage = fakeStorage();
  const session = await import('../js/lib/session.js');
  assert.equal(session.needsLogin(), true);
  session.chooseGuest();
  assert.equal(session.needsLogin(), false);
  assert.equal(session.isSignedIn(), false);
  session.saveLogin({ token: 't1', user: { id: 2, name: 'Asha', email: 'a@b.co' } });
  assert.equal(session.isSignedIn(), true);
  assert.equal(session.getUser().name, 'Asha');
  assert.equal(session.getToken(), 't1');
  session.signOut();
  assert.equal(session.needsLogin(), true);
  assert.equal(session.getUser(), null);
});

test('blocked storage does not break the app: the visitor is simply asked to log in', async () => {
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const session = await import('../js/lib/session.js');
  assert.equal(session.getToken(), null);
  assert.equal(session.needsLogin(), true);
  assert.doesNotThrow(() => session.saveLogin({ token: 'x', user: {} }));
});
