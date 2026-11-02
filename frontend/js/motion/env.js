// Small helpers shared by every motion and 3D module: capability checks, one-time script loading, "run when visible".
export const PALETTE = { paper: '#f2efe7', green: '#29483e', greenSoft: '#5f8a69', terracotta: '#b8604a', gold: '#b9853f', ink: '#24302d' };

/** A machine that cannot keep up with the 3D (measured once, remembered): the drawn versions are used instead. `eklavya.noguard` switches the check off. */
/** Lite mode: no 3D, the drawn mentor, no extra motion. The student's own choice ('1' / '0') wins; with no choice a 2G/3G connection or Data Saver turns it on. */
export const isLite = () => {
  let choice = null;
  try { choice = localStorage.getItem('eklavya.lite'); } catch { /* no storage */ }
  if (choice === '1') return true;
  if (choice === '0') return false;
  const link = globalThis.navigator?.connection;
  return Boolean(link && (link.saveData || /(^|-)2g$|3g/.test(link.effectiveType ?? '')));
};
export const setLite = (on) => { try { localStorage.setItem('eklavya.lite', on ? '1' : '0'); } catch { /* not remembered */ } };

/** Frames per second the page actually manages over `ms`, only counting while it is visible; resolves null if it was hidden. */
export function measureFps(ms = 4000) {
  return new Promise((resolve) => {
    let frames = 0, start = null, seenHidden = false;
    const tick = (time) => {
      if (document.hidden) seenHidden = true;
      if (start === null) start = time;
      frames += 1;
      if (time - start >= ms) resolve(seenHidden ? null : (frames * 1000) / (time - start)); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** After the 3D has had a few seconds to run: if the page manages fewer than `floor` frames a second, switch the 3D off for this machine. */
export async function guardPerformance(floor = 20) {
  try { if (localStorage.getItem('eklavya.noguard') === '1') return true; } catch { /* no storage: still guard */ }
  const fps = await measureFps(4000);
  if (fps !== null && fps < floor) {
    try { localStorage.setItem('eklavya.lite', '1'); } catch { /* not remembered */ }
    document.dispatchEvent(new CustomEvent('eklavya:lite', { detail: { fps: Math.round(fps) } }));
    return false;
  }
  return true;
}

export const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
export const finePointer = () => globalThis.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;

let webglOk;
/** Whether this browser can make a WebGL context (checked once). */
export function hasWebGL() {
  if (webglOk === undefined) {
    try { const canvas = document.createElement('canvas'); webglOk = Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl')); } catch { webglOk = false; }
  }
  return webglOk;
}

const loaded = new Map();
/** Loads a classic script once; resolves when it has run. Paths are relative to the page. */
export function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = src; tag.async = true;
      tag.onload = () => resolve();
      tag.onerror = () => { loaded.delete(src); reject(new Error(`could not load ${src}`)); };
      document.head.append(tag);
    }));
  }
  return loaded.get(src);
}

/** Calls `onShow(true)` when `element` is on screen and `onShow(false)` when it leaves, for as long as `stop()` has not been called. */
export function whenVisible(element, onShow, margin = '80px') {
  const observer = new IntersectionObserver((entries) => onShow(entries.at(-1).isIntersecting), { rootMargin: margin });
  observer.observe(element);
  return () => observer.disconnect();
}

/** Resolves once the page has finished loading and a moment has passed, so heavy 3D work never competes with the first paint. */
export const afterLoad = (ms = 1600) => new Promise((resolve) => {
  const go = () => setTimeout(resolve, ms);
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
});

/** Resolves at the first sign of a person (a move, a key, a touch, a scroll) or after `maxWait`, whichever is first: the heaviest 3D work waits for someone to be there. */
export const whenEngaged = (maxWait = 8000) => new Promise((resolve) => {
  const events = ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];
  const done = () => { events.forEach((name) => removeEventListener(name, done)); clearTimeout(timer); setTimeout(resolve, 600); };
  const timer = setTimeout(done, maxWait);
  events.forEach((name) => addEventListener(name, done, { passive: true, once: true }));
});

export const idle = (callback) => (globalThis.requestIdleCallback ? requestIdleCallback(callback, { timeout: 1500 }) : setTimeout(callback, 200));
