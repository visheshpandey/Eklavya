// Captures mic audio and posts 40 ms chunks of PCM16 (mono, 16 kHz) to the main thread.
class PCMCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(640);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) {
        this.port.postMessage(this.buf.slice().buffer);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PCMCapture);
