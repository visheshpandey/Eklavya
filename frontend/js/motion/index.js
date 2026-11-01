// Entry for the motion layer. It is loaded after the app is on screen and does nothing for "reduce motion"; if a library fails to load the
// app simply stays as it was (every effect is an addition, none is needed to use the page).
import { hasWebGL, idle, loadScript, reducedMotion, whenVisible } from './env.js';

export function startMotion(deps) {
  if (reducedMotion()) return;
  idle(() => import('./motion.js').then((module) => module.initMotion(deps)).catch((error) => console.warn('motion layer not started', error)));
}

/**
 * The 3D book on Today. Built when the desk comes into view, freed when it leaves (another tab, scrolled away for good), rebuilt when it
 * returns. Without WebGL, or with "reduce motion", the drawn CSS book stays as it is. Returns { update(info), dispose() }.
 */
export function mountHeroScene(desk, info) {
  if (reducedMotion() || !hasWebGL()) return { update() {}, dispose() {} };
  let latest = info, scene = null, building = false, visible = false;
  const stop = whenVisible(desk, (now) => {
    visible = now;
    if (now && !scene && !building) {
      building = true;
      loadScript('vendor/gsap.min.js').catch(() => {})
        .then(() => import('./hero-book.js'))
        .then((module) => module.createHeroBook(desk, latest, { gsap: globalThis.gsap }))
        .then((created) => { building = false; if (visible) scene = created; else created.dispose(); })
        .catch((error) => { building = false; console.warn('3D hero not started', error); });
    } else if (!now && scene) { scene.dispose(); scene = null; }
  }, '0px');
  return {
    update(next) { latest = { ...latest, ...next }; scene?.update(latest); },
    dispose() { stop(); scene?.dispose(); scene = null; },
  };
}
