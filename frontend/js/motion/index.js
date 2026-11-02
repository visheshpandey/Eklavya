// Entry for the motion layer. It is loaded after the app is on screen and does nothing for "reduce motion"; if a library fails to load the
// app simply stays as it was (every effect is an addition, none is needed to use the page).
import { afterLoad, hasWebGL, idle, loadScript, reducedMotion, whenVisible } from './env.js';

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
      afterLoad(3500).then(() => loadScript('vendor/gsap.min.js')).catch(() => {})
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
function whileVisible(host, create, apply, { onFail = null, wait = 3500 } = {}) {
  let scene = null, building = false, visible = false;
  whenVisible(host, (now) => {
    visible = now;
    if (now && !scene && !building) {
      building = true;
      afterLoad(wait).then(() => (visible ? create(host) : null)).then((created) => (created ?? Promise.reject(new Error('left before it started')))).then((created) => { building = false; if (visible) { scene = created; apply(scene); } else created.dispose(); })
        .catch((error) => { building = false; if (visible) { console.error('3D scene not started', error); onFail?.(error); } });
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

/**
 * The 3D concept map on Progress. Built when it scrolls into view, freed when it leaves. Returns { update(map), focus(id) }.
 * Without WebGL or with "reduce motion" the host stays hidden and the page's own SVG map is what shows.
 */
export function mountGraph(host, onPick) {
  if (reducedMotion() || !hasWebGL()) return { update() {}, focus() {} };
  const section = host.closest('section');
  let map = null, failed = false;
  // The 2D map stays visible until the 3D one is really on screen: a failed or slow 3D scene must never leave the box empty.
  const show3d = (on) => section?.classList.toggle('is-3d', on);
  const sync = () => {
    const has = Boolean(map?.nodes?.length) && !failed;
    host.hidden = !has;
    host.classList.toggle('is-loading', has && !host.querySelector('canvas'));
    if (!has) show3d(false);
  };
  const fail = (error) => { failed = true; console.error('3D concept map unavailable, showing the 2D map', error); show3d(false); sync(); };
  const current = whileVisible(host, async (element) => {
    const { createGraph } = await import('./graph-3d.js');
    const created = await Promise.race([createGraph(element, map, { onPick }), new Promise((_, reject) => setTimeout(() => reject(new Error('the 3D map took over 20 s to start')), 20000))]);
    show3d(true); host.classList.remove('is-loading');
    const dispose = created.dispose;
    created.dispose = () => { show3d(false); dispose(); sync(); };
    return created;
  }, () => {}, { onFail: fail, wait: 800 });
  return {
    update(next) { map = next; failed = false; sync(); current()?.update(next); },
    focus(id) { current()?.focus(id); },
  };
}

/** Whether a 3D scene may be drawn at all (WebGL present, no "reduce motion"). */
export const canScene = () => !reducedMotion() && hasWebGL();

/** A scene hosted in `host` for as long as it is on screen: `create(host)` resolves to it, `apply(scene)` replays what it missed. Returns { scene() }. */
export function mountOnScreen(host, create, apply = () => {}, options = {}) {
  if (!canScene()) return { scene: () => null };
  return { scene: whileVisible(host, async (element) => { await loadScript('vendor/gsap.min.js').catch(() => {}); return create(element); }, apply, options) };
}
