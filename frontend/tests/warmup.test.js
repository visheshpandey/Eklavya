// The backend warm-up: health pings, the 3 s "waking" note, 12 retries 5 s apart, "ready", and "slow" with a Retry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWarmup, healthPing, MAX_RETRIES, MESSAGES } from '../js/lib/warmup.js';

function clock() {
  let now = 0, id = 0;
  const tasks = [];
  return {
    schedule: (fn, ms) => { tasks.push({ id: ++id, at: now + ms, fn }); return id; },
    cancel: (taskId) => { const i = tasks.findIndex((t) => t.id === taskId); if (i >= 0) tasks.splice(i, 1); },
    now: () => now,
    async tick(ms) {
      const end = now + ms;
      for (;;) {
        for (let i = 0; i < 20; i++) await Promise.resolve();   // let pending promise steps run
        tasks.sort((a, b) => a.at - b.at);
        const next = tasks[0];
        if (!next || next.at > end) break;
        tasks.shift(); now = next.at; next.fn();
      }
      now = end;
      for (let i = 0; i < 20; i++) await Promise.resolve();
    },
  };
}

function setup(answers) {   // answers: the list of ping results in order; the last one repeats
  const c = clock();
  const calls = [];
  const ping = async () => { calls.push(c.now()); return answers[Math.min(calls.length - 1, answers.length - 1)]; };
  const warmup = createWarmup({ ping, schedule: c.schedule, cancel: c.cancel });
  const states = [];
  warmup.onChange((s) => states.push(s));
  return { c, calls, warmup, states };
}

test('a server that answers at once never shows the waking note', async () => {
  const { c, warmup, states } = setup([true]);
  warmup.start();
  await c.tick(10);
  assert.equal(warmup.state(), 'ready');
  assert.deepEqual(states, ['ready']);
  assert.equal(warmup.wasWaking(), false);
});

test('no answer within 3 s: "waking"; it asks again every 5 s; the first answer makes it "ready"', async () => {
  const { c, calls, warmup, states } = setup([false, false, false, true]);
  warmup.start();
  await c.tick(2999); assert.equal(warmup.state(), 'checking');
  await c.tick(2); assert.equal(warmup.state(), 'waking');
  await c.tick(20000);
  assert.deepEqual(calls, [0, 5000, 10000, 15000]);               // one ping every 5 s
  assert.equal(warmup.state(), 'ready');
  assert.deepEqual(states, ['waking', 'ready']);
  assert.equal(warmup.wasWaking(), true);                         // so "Eklavya is ready" is worth saying
});

test('12 retries without an answer: "slow", and requests that were waiting are let go', async () => {
  const { c, calls, warmup } = setup([false]);
  let released = false;
  warmup.settled().then(() => { released = true; });
  warmup.start();
  await c.tick(12 * 5000 - 1);
  assert.notEqual(warmup.state(), 'slow');
  await c.tick(10);
  assert.equal(calls.length, MAX_RETRIES + 1);                    // the first ask and 12 more
  assert.equal(warmup.state(), 'slow');
  assert.equal(released, true);
  assert.match(MESSAGES.slow, /taking longer than usual/);
  assert.match(MESSAGES.slow, /browse your notes/);
});

test('Retry starts over, and a later answer makes it "ready" again', async () => {
  const { c, warmup } = setup([false, false, false, false, false, false, false, false, false, false, false, false, false, true]);   // 13 failures, then up
  warmup.start();
  await c.tick(61000);
  assert.equal(warmup.state(), 'slow');
  warmup.retry();
  assert.equal(warmup.state(), 'checking');
  await c.tick(100);
  assert.equal(warmup.state(), 'ready');
  warmup.retry();                                                   // nothing to retry once ready
  assert.equal(warmup.state(), 'ready');
});

test('the health ping is true only for an {"ok": true} answer, and false for errors, timeouts and pages that are not JSON', async () => {
  const answer = (body, ok = true) => async () => ({ ok, json: async () => body });
  assert.equal(await healthPing({ fetchFn: answer({ ok: true, version: 'x' }) })(), true);
  assert.equal(await healthPing({ fetchFn: answer({ ok: false }) })(), false);
  assert.equal(await healthPing({ fetchFn: answer({ ok: true }, false) })(), false);                 // a 503
  assert.equal(await healthPing({ fetchFn: async () => ({ ok: true, json: async () => { throw new Error('html'); } }) })(), false);
  assert.equal(await healthPing({ fetchFn: async () => { throw new TypeError('network'); } })(), false);
  const hangs = healthPing({ fetchFn: (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))), timeoutMs: 20 });
  assert.equal(await hangs(), false);                                                                // a sleeping server holds the request open: given up after the timeout
});
