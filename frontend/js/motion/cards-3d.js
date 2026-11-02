// Two small 3D scenes for Flashcards: a floating stack of cards for the empty state, and the six Leitner boxes (0 to 5) that a card drops into
// when it is rated. Both are drawn in the palette with a soft contact shadow, and both are freed when they leave the screen.
import { PALETTE } from './env.js';
import { THREE, canvasTexture, createStage } from './scene-kit.js';

const SERIF = '"Instrument Serif", Georgia, serif', MONO = '"DM Mono", ui-monospace, monospace';
const BOX_DAYS = ['NOW', '1 DAY', '3 DAYS', '7 DAYS', '14 DAYS', '30 DAYS'];
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

function cardFace(text, hint) {
  return canvasTexture(512, 350, (ctx, w, h) => {
    ctx.fillStyle = '#faf8f2'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(36,48,45,.14)'; ctx.lineWidth = 3; ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = PALETTE.terracotta; ctx.font = `italic 150px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillText(text, w / 2, h / 2 + 40);
    if (hint) { ctx.fillStyle = '#8a7f69'; ctx.font = `500 22px ${MONO}`; ctx.letterSpacing = '4px'; ctx.fillText(hint, w / 2, h - 46); }
  });
}

export function createStack(host) {
  const stage = createStage(host, { fov: 30, position: [0, 1.7, 5.2], target: [0, 0.55, 0] });
  stage.key.position.set(-2.2, 4, 3);
  const group = new THREE.Group();
  stage.scene.add(group);
  const face = cardFace('?', 'YOUR CARDS GATHER HERE');
  const tints = [0xefe7d3, 0xe3e9dc, 0xf0e2d9, 0xfaf8f2];
  tints.forEach((tint, i) => {
    const top = i === tints.length - 1;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.035, 1.17),
      [0, 1, 2, 3, 4, 5].map((side) => (top && side === 2 ? new THREE.MeshStandardMaterial({ map: face.texture, roughness: 0.9 }) : new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9 }))));
    mesh.position.set(Math.sin(i * 1.7) * 0.07, 0.04 + i * 0.075, Math.cos(i * 1.3) * 0.05);
    mesh.rotation.y = (i - 1.5) * 0.14;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  });
  group.rotation.x = 0.0;
  stage.add({ run(delta, time) {
    group.position.y = 0.45 + Math.sin(time * 1.3) * 0.08;
    group.rotation.y = Math.sin(time * 0.5) * 0.35;
    group.rotation.z = Math.sin(time * 0.7) * 0.03;
  } });
  return { dispose() { face.texture.dispose(); stage.dispose(); } };
}

const SHELF_WIDTH = 8.9;   // world units the six boxes span; the camera is placed so this always fits the canvas

export function createBoxes(host, { gsap = globalThis.gsap } = {}) {
  const stage = createStage(host, { fov: 28, position: [0, 1.9, 3.2], target: [0, 0.22, 0], onDemand: true });
  stage.key.position.set(-2.4, 4.4, 3);
  const slots = [];
  const counts = [0, 0, 0, 0, 0, 0];
  const NAMES = ['NEW', '1D', '3D', '7D', '14D', '30D'];

  const drawLabel = (index) => (ctx, w, h) => {
    ctx.fillStyle = '#faf8f2'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#8a7f69'; ctx.font = `500 44px ${MONO}`; ctx.letterSpacing = '4px'; ctx.textAlign = 'left'; ctx.fillText(NAMES[index], 30, 64);
    ctx.fillStyle = PALETTE.ink; ctx.font = `120px ${SERIF}`; ctx.textAlign = 'right'; ctx.fillText(String(counts[index]), w - 30, h - 30);
  };
  for (let i = 0; i < 6; i += 1) {
    const color = mix(PALETTE.terracotta, PALETTE.greenSoft, i / 5);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
    const box = new THREE.Group();
    const part = (w, h, d, x, y, z) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; box.add(mesh); };
    part(1.05, 0.05, 0.8, 0, 0.025, 0);
    part(1.05, 0.5, 0.05, 0, 0.25, 0.375);
    part(1.05, 0.5, 0.05, 0, 0.25, -0.375);
    part(0.05, 0.5, 0.8, -0.5, 0.25, 0);
    part(0.05, 0.5, 0.8, 0.5, 0.25, 0);
    const label = canvasTexture(384, 192, drawLabel(i));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.43), new THREE.MeshStandardMaterial({ map: label.texture, roughness: 0.9 }));
    plate.position.set(0, 0.25, 0.402); box.add(plate);
    box.position.set((i - 2.5) * 1.28, 0, 0);
    stage.scene.add(box);
    slots.push({ box, label, drawLabel: () => label.redraw(drawLabel(i)) });
  }
  stage.add({ resize(width, height, cam) {   // always show the whole shelf, whatever the width
    const distance = (SHELF_WIDTH / 2) / (Math.tan((cam.fov * Math.PI) / 360) * (width / height));
    cam.position.set(0, 0.5 * distance * 0.7 + 0.2, Math.max(2.4, distance * 0.95));
    stage.wake();
  } });

  return {
    setCounts(next) { stage.wake(); next.forEach((n, i) => { if (counts[i] !== n) { counts[i] = n; slots[i].drawLabel(); } }); },
    /** Where box `i` is on screen (a fraction of the canvas width), so a card can fly to it. */
    xFraction: (i) => 0.5 + ((i - 2.5) * 1.28) / SHELF_WIDTH,
    /** A card has landed in box `to`: it gives a little. */
    land(to) {
      if (!gsap || !slots[to]) return;
      stage.wake(1200);
      gsap.fromTo(slots[to].box.scale, { y: 1 }, { y: 0.84, duration: 0.1, yoyo: true, repeat: 1, ease: 'power1.out' });
      gsap.fromTo(slots[to].box.position, { y: 0 }, { y: 0.06, duration: 0.14, yoyo: true, repeat: 1 });
    },
    dispose() { for (const slot of slots) slot.label.texture.dispose(); stage.dispose(); },
  };
}
