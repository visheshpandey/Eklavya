// VoiceClient session handling, with fake microphone / audio / WebSocket objects (no browser needed).
// The regression these guard: a slow leftover from an old session (its socket closing late, a start that was
// cancelled while the mic prompt was open) used to wipe the audio objects of the NEW session, which then crashed with
// "Cannot read properties of null (reading 'audioWorklet')".
import test from 'node:test';
import assert from 'node:assert/strict';

import { VoiceClient } from '../js/services/voice-client.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

let contexts, sockets, tracksStopped, micRequests;

class FakeAudioContext {
  constructor(options) {
    this.sampleRate = options.sampleRate;
    this.closed = false;
    this.currentTime = 0;
    this.destination = {};
    this.audioWorklet = { addModule: async () => {} };
    contexts.push(this);
  }
  createMediaStreamSource() { return { connect() {} }; }
  close() {                                                      // like a real AudioContext: closing twice rejects
    if (this.closed) return Promise.reject(new Error('InvalidStateError: Cannot close a closed AudioContext.'));
    this.closed = true;
    return Promise.resolve();
  }
}
class FakeNode { constructor() { this.port = {}; } disconnect() {} }
class FakeWebSocket {
  static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; this.handlers = {}; sockets.push(this); }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  send(data) { this.sent.push(data); }
  close() { this.readyState = FakeWebSocket.CLOSING; }          // the real "close" event arrives later (see fireClose)
  open() { this.readyState = FakeWebSocket.OPEN; this.handlers.open?.(); }
  fail() { this.handlers.error?.(); }
  fireClose() { this.readyState = FakeWebSocket.CLOSED; this.onclose?.(); }
}

function setup() {
  contexts = []; sockets = []; tracksStopped = 0; micRequests = [];
  globalThis.AudioContext = FakeAudioContext;
  globalThis.AudioWorkletNode = FakeNode;
  globalThis.WebSocket = FakeWebSocket;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: () => {
          const gate = deferred();
          micRequests.push(gate);                                  // the test decides when (and how) the prompt is answered
          return gate.promise;
        },
      },
    },
  });
  const events = [], statuses = [];
  const client = new VoiceClient({ onEvent: (e) => events.push(e), onStatus: (s) => statuses.push(s) });
  const allowMic = (i = micRequests.length - 1) => micRequests[i].resolve({ getTracks: () => [{ stop: () => { tracksStopped++; } }] });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return { client, events, statuses, allowMic, settle };
}

test('a normal start reaches "listening" and delivers server events', async () => {
  const { client, events, statuses, allowMic, settle } = setup();
  const started = client.start({ userId: 1, lang: 'hinglish', mode: 'learn', topicId: 7 });
  allowMic();
  await settle();
  sockets[0].open();
  await started;
  assert.deepEqual(statuses, ['connecting', 'listening']);
  assert.match(sockets[0].url, /\/ws\/voice\?user_id=1&lang=hinglish&mode=learn&topic_id=7$/);
  sockets[0].onmessage({ data: JSON.stringify({ type: 'transcript', role: 'tutor', text: 'Hi', final: false }) });
  assert.equal(events[0].text, 'Hi');
  client.sendText('hello');
  assert.deepEqual(JSON.parse(sockets[0].sent.at(-1)), { type: 'user_text', text: 'hello' });
});

test('a debate adds the side and the encoded motion to the socket URL; other modes do not', async () => {
  const { client, allowMic, settle } = setup();
  const started = client.start({ mode: 'debate', topicId: 7, side: 'against', motion: 'Recall > precision?' });
  allowMic();
  await settle();
  sockets[0].open();
  await started;
  assert.match(sockets[0].url, /&mode=debate&topic_id=7&side=against&motion=Recall%20%3E%20precision%3F$/);
});

test('stopping while the microphone prompt is open cancels quietly and releases everything', async () => {
  const { client, statuses, allowMic, settle } = setup();
  const started = client.start();
  client.stop();                                                   // the student cancels before answering the prompt
  allowMic();                                                      // ...and the prompt is answered afterwards
  await settle();
  await started;                                                   // resolves: no "Cannot read properties of null"
  assert.equal(sockets.length, 0);                                 // no connection was opened for the cancelled start
  assert.equal(tracksStopped, 1);                                  // the mic was released
  assert.ok(contexts.every((c) => c.closed));
  assert.equal(client.status, 'idle');
  assert.equal(statuses.at(-1), 'idle');
});

test('an old socket closing late does not tear down the new session that is starting (the reported crash)', async () => {
  const { client, allowMic, settle } = setup();
  const first = client.start();
  allowMic(0);
  await settle();
  sockets[0].open();
  await first;                                                     // session A is live

  client.stop();                                                   // ...ended by starting something else
  const second = client.start();                                   // session B begins; its mic prompt is still open
  sockets[0].fireClose();                                          // A's close event finally arrives, mid-start of B
  allowMic(1);
  await settle();
  sockets[1].open();
  await second;                                                    // B must complete normally

  assert.equal(client.status, 'listening');
  assert.equal(sockets[1].readyState, FakeWebSocket.OPEN);
  const live = contexts.filter((c) => !c.closed);
  assert.equal(live.length, 2, 'session B keeps its two audio contexts');
});

test('starting again while a start is still waiting cancels the first and completes the second', async () => {
  const { client, allowMic, settle } = setup();
  const first = client.start();
  client.stop();
  const second = client.start();
  allowMic(0);                                                     // first prompt answered late: must be ignored
  allowMic(1);
  await settle();
  assert.equal(sockets.length, 1);                                 // only the second start opened a connection
  sockets[0].open();
  await Promise.all([first, second]);
  assert.equal(client.status, 'listening');
});

test('a denied microphone gives a clear message and returns to idle', async () => {
  const { client } = setup();
  const started = client.start();
  micRequests[0].reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
  await assert.rejects(started, /Microphone permission was denied\./);
  assert.equal(client.status, 'idle');
});

test('a connection that fails to open says so and returns to idle', async () => {
  const { client, allowMic, settle } = setup();
  const started = client.start();
  allowMic();
  await settle();
  sockets[0].fail();
  await assert.rejects(started, /Voice connection failed/);
  assert.equal(client.status, 'idle');
  assert.ok(contexts.every((c) => c.closed));
});

test('the server closing the live socket ends the session', async () => {
  const { client, allowMic, settle } = setup();
  const started = client.start();
  allowMic();
  await settle();
  sockets[0].open();
  await started;
  sockets[0].fireClose();
  assert.equal(client.status, 'idle');
});

test('tearing a session down twice never leaves an unhandled "Cannot close a closed AudioContext" rejection', async () => {
  const unhandled = [];
  const listener = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', listener);
  try {
    const { client, allowMic, settle } = setup();
    const started = client.start();
    allowMic();
    await settle();
    sockets[0].open();
    await started;
    client.stop();                                               // closes the contexts
    client.stop();                                               // and again (a stray stop, or a late socket close)
    const second = client.start();                               // a restart that is cancelled releases its own contexts too
    client.stop();
    allowMic(1);
    await settle();
    await second;
    await new Promise((resolve) => setTimeout(resolve, 20));     // let any rejection surface
  } finally {
    process.off('unhandledRejection', listener);
  }
  assert.deepEqual(unhandled, []);
});
