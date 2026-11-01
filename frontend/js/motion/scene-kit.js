// The shared base of every 3D scene: one renderer with the rules the whole app follows.
//   - pixel ratio never above 2, canvas sized by its host, antialiased, transparent (the page colour shows through)
//   - a soft warm key light, an ambient fill and a shadow-catching floor, all in the palette's warm tones
//   - the loop runs only while the host is on screen and the tab is visible; dispose() frees everything the GPU holds
import * as THREE from 'three';
import { whenVisible } from './env.js';

export { THREE };

export function createStage(host, { fov = 28, position = [0, 4.0, 3.6], target = [0, 0.15, 0.1], shadows = true, floor = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'scene-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 60);
  camera.position.set(...position);
  const lookAt = new THREE.Vector3(...target);
  camera.lookAt(lookAt);

  scene.add(new THREE.AmbientLight(0xfffaf0, 1.05));
  const key = new THREE.DirectionalLight(0xfff0dc, 1.7);   // warm, from the upper left, like a desk lamp
  key.position.set(-2.6, 4.2, 2.8);
  key.castShadow = shadows;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 14 });
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0xfffaf0, 0x29483e, 0.25));   // a little green bounce from the hero behind

  if (floor) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ color: 0x0d1a14, opacity: 0.34 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  const ticks = new Set();
  const clock = new THREE.Clock();
  let running = false;
  let onScreen = false;
  const size = () => {
    const { clientWidth: width, clientHeight: height } = host;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    for (const tick of ticks) tick.resize?.(width, height, camera);
  };
  const frame = () => {
    const delta = Math.min(clock.getDelta(), 0.1), time = clock.elapsedTime;
    for (const tick of ticks) tick.run?.(delta, time);
    camera.lookAt(lookAt);
    renderer.render(scene, camera);
  };
  const sync = () => {
    const should = onScreen && !document.hidden;
    if (should && !running) { running = true; clock.getDelta(); renderer.setAnimationLoop(frame); }
    if (!should && running) { running = false; renderer.setAnimationLoop(null); }
  };
  const resizer = new ResizeObserver(size);
  resizer.observe(host);
  const stopWatching = whenVisible(host, (visible) => { onScreen = visible; sync(); });
  const onVisibility = () => sync();
  document.addEventListener('visibilitychange', onVisibility);
  size();

  return {
    THREE, scene, camera, renderer, canvas, key, lookAt,
    /** Something that runs every frame ({ run(delta, time), resize(w, h, camera) }). */
    add(tick) { ticks.add(tick); tick.resize?.(host.clientWidth, host.clientHeight, camera); return tick; },
    isRunning: () => running,
    dispose() {
      running = false;
      renderer.setAnimationLoop(null);
      resizer.disconnect();
      stopWatching();
      document.removeEventListener('visibilitychange', onVisibility);
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        for (const material of [].concat(object.material ?? [])) {
          for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
          material.dispose?.();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

/** A canvas drawn by `draw(ctx, w, h)` and used as a texture; `redraw(fn)` paints it again. */
export function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { canvas, texture, redraw(fn) { ctx.clearRect(0, 0, width, height); fn(ctx, width, height); texture.needsUpdate = true; } };
}

/** Wraps `text` to at most `lines` lines of `maxWidth` px in the current ctx font. */
export function wrapText(ctx, text, maxWidth, lines = 2) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  if (out.length > lines) { const kept = out.slice(0, lines); kept[lines - 1] = `${kept[lines - 1].replace(/\s+\S*$/, '')}…`; return kept; }
  return out;
}
