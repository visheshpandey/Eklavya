import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstaller } from '../js/lib/install.js';

function fakeWindow() {
  const target = new EventTarget();
  return Object.assign(target, {});
}
function offer(outcome) {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = async () => {};
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

test('nothing to install until the browser offers it', async () => {
  const host = fakeWindow(), log = [];
  const installer = createInstaller({ onAvailable: (v) => log.push(v), host });
  assert.equal(installer.available(), false);
  assert.equal(await installer.install(), 'unavailable');
  assert.deepEqual(log, []);
});

test('the browser offer is kept for our button and shown', () => {
  const host = fakeWindow(), log = [];
  const installer = createInstaller({ onAvailable: (v) => log.push(v), host });
  const event = offer('accepted');
  host.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(installer.available(), true);
  assert.deepEqual(log, [true]);
});

test('accepting installs once and hides the button', async () => {
  const host = fakeWindow(), log = [];
  const installer = createInstaller({ onAvailable: (v) => log.push(v), host });
  host.dispatchEvent(offer('accepted'));
  assert.equal(await installer.install(), 'accepted');
  assert.equal(installer.available(), false);
  assert.equal(await installer.install(), 'unavailable');
  assert.deepEqual(log, [true, false]);
});

test('dismissing is reported, and a finished install hides the button', async () => {
  const host = fakeWindow(), log = [];
  const installer = createInstaller({ onAvailable: (v) => log.push(v), host });
  host.dispatchEvent(offer('dismissed'));
  assert.equal(await installer.install(), 'dismissed');
  host.dispatchEvent(offer('accepted'));
  host.dispatchEvent(new Event('appinstalled'));
  assert.equal(installer.available(), false);
  assert.equal(log.at(-1), false);
});
