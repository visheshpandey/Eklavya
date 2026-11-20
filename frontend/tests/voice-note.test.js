import test from 'node:test';
import assert from 'node:assert/strict';
import { VOICE_WAIT_MS, mountVoiceNote } from '../js/components/voice-note.js';
import { VoiceClient } from '../js/services/voice-client.js';

function dom() {
  // a tiny stand-in for the document: the note only needs createElement, textContent, append, replaceChildren and addEventListener
  const make = (tag) => ({ tag, children: [], listeners: {}, attrs: {}, textContent: '', hidden: false,
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(type, fn) { this.listeners[type] = fn; }, append(...k) { this.children.push(...k); }, replaceChildren(...k) { this.children = k; }, nodeType: 1 });
  globalThis.document = { createElement: make, createTextNode: (t) => ({ nodeType: 3, textContent: t }) };
  return make('div');
}

test('voice pre-connect: nothing shows if the voice is ready in time; after 20 s the note offers text; the button turns text on', () => {
  const root = dom(); const timers = []; let ready = false, text = 0;
  const note = mountVoiceNote({ root, isReady: () => ready, onText: () => { text++; }, schedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, cancel: () => {} });
  note.show();
  assert.equal(timers.at(-1).ms, VOICE_WAIT_MS); assert.equal(VOICE_WAIT_MS, 20000);
  assert.equal(root.hidden, true);
  timers.at(-1).fn();                                                    // 20 s and still not ready
  assert.equal(root.hidden, false);
  const label = (n) => (n.textContent || '') + (n.children ?? []).map(label).join('');
  assert.match(label(root), /Voice is still connecting/);
  assert.match(label(root), /Continue with text/);
  root.children.at(-1).listeners.click();                                // the button
  assert.equal(text, 1);
  assert.match(label(root), /Text mode is on/);
  const later = mountVoiceNote({ root: dom(), isReady: () => true, onText() {}, schedule: (fn, ms) => { timers.push({ fn, ms }); return 0; }, cancel: () => {} });
  const before = timers.length;
  later.show();
  assert.equal(timers.length, before);                                   // already ready: no timer, no note
});

test('the voice client pre-connects without the microphone and is ready only after the server says "standby"', () => {
  const sockets = [];
  globalThis.WebSocket = class { static OPEN = 1; static CLOSING = 2; constructor(url) { this.url = url; this.readyState = 1; sockets.push(this); } send() {} close() { this.readyState = 3; } };
  globalThis.localStorage = { getItem: (k) => (k === 'eklavya.guestToken' ? 'guest-token' : null), setItem() {}, removeItem() {} };   // a private guest exists
  const states = [];
  const client = new VoiceClient({ onEvent() {}, onStatus() {}, onStandby: (r) => states.push(r) });
  client.prewarm({ lang: 'hinglish' });
  assert.equal(sockets.length, 1);
  assert.match(sockets[0].url, /standby=1/);
  assert.equal(client.standbyReady, false);                              // connected, but the server has not said it is ready
  sockets[0].onmessage({ data: JSON.stringify({ type: 'standby' }) });
  assert.equal(client.standbyReady, true);
  assert.deepEqual(states, [true]);
  client.prewarm({ lang: 'hinglish' });
  assert.equal(sockets.length, 1);                                       // one standby socket at a time
  client.dropStandby();
  assert.equal(client.standbyReady, false);
});

test('an older server that starts a real session on the standby socket is detected: the socket is ended and never opened again', () => {
  const sockets = [], sent = [];
  globalThis.WebSocket = class { static OPEN = 1; static CLOSING = 2; constructor(url) { this.url = url; this.readyState = 1; sockets.push(this); } send(m) { sent.push(m); } close() { this.readyState = 3; } };
  globalThis.localStorage = { getItem: (k) => (k === 'eklavya.guestToken' ? 'guest-token' : null), setItem() {}, removeItem() {} };
  const states = [];
  const client = new VoiceClient({ onEvent() {}, onStatus() {}, onStandby: (r) => states.push(r) });
  client.prewarm({});
  sockets[0].onmessage({ data: JSON.stringify({ type: 'session', id: 'abc' }) });   // an old server: a session, not "standby"
  assert.equal(client.standbyReady, false);
  assert.ok(sent.some((m) => JSON.parse(m).type === 'end'));                          // the accidental session is ended
  assert.equal(sockets[0].readyState, 3);
  client.prewarm({});
  assert.equal(sockets.length, 1);                                                    // and no second try
});
