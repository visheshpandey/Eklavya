// The Sound toggle: a soft page-turn when something flips or opens, and (when on) the option to hear an answer read aloud.
// Remembered in localStorage. Everything is guarded: no audio support just means silence.
const KEY = 'eklavya.sound';

export function loadSound(storage = globalThis.localStorage) {
  try { return storage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function saveSound(on, storage = globalThis.localStorage) {
  try { storage.setItem(KEY, on ? 'on' : 'off'); } catch { /* not remembered */ }
}

export function createSound({ on = true, audio = globalThis } = {}) {
  let enabled = on;
  let context = null;

  /** About a fifth of a second of filtered noise, falling in pitch: paper. */
  function pageTurn() {
    if (!enabled) return;
    try {
      const Ctx = audio.AudioContext || audio.webkitAudioContext;
      if (!Ctx) return;
      context ??= new Ctx();
      if (context.state === 'suspended') context.resume();
      const duration = 0.22, rate = context.sampleRate;
      const buffer = context.createBuffer(1, Math.floor(rate * duration), rate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) { const t = i / data.length; data[i] = (Math.random() * 2 - 1) * (1 - t) ** 2.2 * (t < 0.08 ? t / 0.08 : 1); }
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass'; filter.Q.value = 0.8;
      filter.frequency.setValueAtTime(3200, context.currentTime);
      filter.frequency.exponentialRampToValueAtTime(900, context.currentTime + duration);
      const gain = context.createGain();
      gain.gain.value = 0.3;
      source.connect(filter).connect(gain).connect(context.destination);
      source.start();
    } catch { /* silence is fine */ }
  }

  /** Read text aloud. `force` is for a button the student pressed on purpose: it works even when the Sound toggle is off. */
  function speak(text, lang = 'en-IN', { force = false } = {}) {
    if ((!enabled && !force) || !audio.speechSynthesis) return false;
    try {
      audio.speechSynthesis.cancel();
      const utterance = new audio.SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      audio.speechSynthesis.speak(utterance);
      return true;
    } catch { return false; }
  }
  const isSpeaking = () => { try { return Boolean(audio.speechSynthesis?.speaking); } catch { return false; } };
  const stopSpeaking = () => { try { audio.speechSynthesis?.cancel(); } catch { /* nothing playing */ } };

  return {
    isOn: () => enabled,
    set(value) { enabled = Boolean(value); if (!enabled) stopSpeaking(); },
    pageTurn, speak, stopSpeaking, isSpeaking,
  };
}
