import test from 'node:test';
import assert from 'node:assert/strict';
import { createDictation, recognitionLang } from '../js/lib/dictation.js';

test('Hindi is recognised as hi-IN, English and Hinglish as en-IN', () => {
  assert.equal(recognitionLang('hindi'), 'hi-IN');
  assert.equal(recognitionLang('english'), 'en-IN');
  assert.equal(recognitionLang('hinglish'), 'en-IN');
});

test('without browser support it says so and does nothing', () => {
  const d = createDictation({ getLanguage: () => 'english', onText() {}, onState() {}, host: {} });
  assert.equal(d.available(), false);
  assert.doesNotThrow(() => { d.start(); d.stop(); });
});

test('what is heard is added after the text already typed, and listening ends', () => {
  const log = [];
  const results = [Object.assign([{ transcript: 'what is recall' }], { isFinal: true })];
  class Fake {
    start() { this.onresult({ results }); this.onend(); }
    stop() {}
  }
  const d = createDictation({ getLanguage: () => 'hindi', onText: (text, final) => log.push(['text', text, final]),
    onState: (state) => log.push(['state', state]), host: { SpeechRecognition: Fake } });
  d.start('Explain');
  assert.deepEqual(log[0], ['state', 'listening']);
  assert.deepEqual(log[1], ['text', 'Explain what is recall', true]);
  assert.deepEqual(log.at(-1), ['state', 'idle']);
  assert.equal(d.listening(), false);
});
