// Small helpers shared by every motion and 3D module: capability checks, one-time script loading, "run when visible".
export const PALETTE = { paper: '#f2efe7', green: '#29483e', greenSoft: '#5f8a69', terracotta: '#b8604a', gold: '#b9853f', ink: '#24302d' };

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

export const idle = (callback) => (globalThis.requestIdleCallback ? requestIdleCallback(callback, { timeout: 1500 }) : setTimeout(callback, 200));
