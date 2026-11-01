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

/** Builds `create(host)` (a promise of { dispose, ... }) while `host` is on screen and frees it when it is not; `apply(scene)` replays the latest settings. */
function whileVisible(host, create, apply) {
  let scene = null, building = false, visible = false;
  whenVisible(host, (now) => {
    visible = now;
    if (now && !scene && !building) {
      building = true;
      create(host).then((created) => { building = false; if (visible) { scene = created; apply(scene); } else created.dispose(); })
        .catch((error) => { building = false; console.warn('3D scene not started', error); });
    } else if (!now && scene) { scene.dispose(); scene = null; }
  }, '0px');
  return () => scene;
}

/** The 3D mentor inside an avatar element: returns { set({state, mood, tutor}), setLevel(level) }. The drawn face stays under it as the fallback. */
export function mountMentor(host, tutor) {
  if (reducedMotion() || !hasWebGL()) return { set() {}, setLevel() {} };
  const latest = { state: 'idle', mood: 'calm', tutor, level: 0 };
  const current = whileVisible(host, async (element) => {
    const { createBestMentor } = await import('./mentor-3d.js');
    const created = await createBestMentor(element, { tutor: latest.tutor });
    element.classList.add('is-3d');
    const dispose = created.dispose;
    created.dispose = () => { element.classList.remove('is-3d'); dispose(); };
    return created;
  }, (scene) => { scene.set(latest); scene.setLevel(latest.level); });
  return {
    set(next) { Object.assign(latest, next); current()?.set(next); },
    setLevel(level) { latest.level = level; current()?.setLevel(level); },
  };
}

/** The microphone orb: wraps the button so a 3D sphere can sit behind it; returns { setState(state), setLevel(level) }. */
export function mountOrb(button) {
  if (reducedMotion() || !hasWebGL()) return { setState() {}, setLevel() {} };
  const wrap = document.createElement('span');
  wrap.className = 'orb-wrap';
  button.parentNode.insertBefore(wrap, button);
  wrap.append(button);
  const host = document.createElement('span');
  host.className = 'orb3d';
  wrap.prepend(host);
  const latest = { state: 'idle', level: 0 };
  const current = whileVisible(host, async (element) => {
    const { createOrb } = await import('./orb-3d.js');
    const created = createOrb(element);
    wrap.classList.add('is-3d');
    const dispose = created.dispose;
    created.dispose = () => { wrap.classList.remove('is-3d'); dispose(); };
    return created;
  }, (scene) => { scene.setState(latest.state); scene.setLevel(latest.level); });
  return {
    setState(state) { latest.state = state; current()?.setState(state); },
    setLevel(level) { latest.level = level; current()?.setLevel(level); },
  };
}
