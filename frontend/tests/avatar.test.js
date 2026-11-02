// The pure parts of the avatar system: which state to show, the 24 kHz -> 16 kHz resampling for Simli, and Simli's refusal paths (no network needed).
import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveState } from '../js/avatar/system.js';
import { SimliProvider, resampleTo16k } from '../js/avatar/simli-provider.js';
import { VOICE_STATUS } from '../js/lib/protocol.js';

test('deriveState: connecting is thinking, speaking is speaking, a right answer is happy', () => {
  assert.equal(deriveState({ status: VOICE_STATUS.IDLE }), 'idle');
  assert.equal(deriveState({ status: VOICE_STATUS.CONNECTING }), 'thinking');
  assert.equal(deriveState({ status: VOICE_STATUS.LISTENING }), 'listening');
  assert.equal(deriveState({ status: VOICE_STATUS.SPEAKING }), 'speaking');
  assert.equal(deriveState({ status: VOICE_STATUS.SPEAKING, result: { is_correct: true } }), 'happy');
});

test('deriveState: a wrong answer looks concerned only while the student is quiet', () => {
  assert.equal(deriveState({ status: VOICE_STATUS.LISTENING, result: { is_correct: false }, level: 0 }), 'concerned');
  assert.equal(deriveState({ status: VOICE_STATUS.LISTENING, result: { is_correct: false }, level: 0.5 }), 'listening');
});

test('resampleTo16k turns 24 kHz PCM16 into 16 kHz PCM16 (two thirds as many samples)', () => {
  const input = new Int16Array(2400).map((_, i) => Math.round(Math.sin(i / 20) * 10000));
  const output = resampleTo16k(new Uint8Array(input.buffer));
  assert.equal(output.byteLength / 2, 1600);
  const samples = new Int16Array(output.buffer);
  assert.ok(Math.abs(samples[100] - Math.round(Math.sin((100 * 1.5) / 20) * 10000)) < 80, 'the waveform survives');
});

test('resampleTo16k keeps silence silent and never throws on an empty chunk', () => {
  assert.equal(resampleTo16k(new Uint8Array(0)).byteLength, 0);
  assert.ok(new Int16Array(resampleTo16k(new Uint8Array(new Int16Array(300).buffer)).buffer).every((v) => v === 0));
});

test('SimliProvider refuses without a face id, and when the session endpoint is not there', async () => {
  const container = { append() {} };
  const fakeDocument = { createElement: () => ({ remove() {} }) };
  globalThis.document ??= fakeDocument;
  await assert.rejects(new SimliProvider({ faceId: '' }).init(container), /face id/);
  const refusing = new SimliProvider({ faceId: 'abcd-1234-abcd', fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(refusing.init(container), /503/);
});
