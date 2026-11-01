// The Study room mentor in 3D: a stylised bust built from three.js primitives in the palette (no download), or a rigged GLB if config.js names one
// (mentorModel). It breathes, blinks, looks toward the pointer, nods while the student speaks, tilts and looks up while it thinks, smiles on
// a right answer and softens on a wrong one. The mouth follows the loudness of whoever is speaking (the same 0-1 level that drives the orb),
// which works for English, Hindi and Hinglish alike because it follows the sound, not the words.
import { THREE, createStage } from './scene-kit.js';

const SKIN = { mentor: 0xe9b98f, senior: 0xd9a47a };
const HAIR = { mentor: 0x2b2622, senior: 0x3a2a1f };
const TOP = { mentor: 0x29483e, senior: 0xb8604a };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

// A rigged avatar is used only when config.js names one (mentorModel: 'assets/mentor.glb'): nothing is requested otherwise.
const modelUrl = () => globalThis.APP_CONFIG?.mentorModel || '';

function std(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.78, ...extra }); }

function buildBust(tutor) {
  const rig = new THREE.Group();
  const skin = std(SKIN[tutor]);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.62, 8, 20), std(TOP[tutor]));
  torso.rotation.z = Math.PI / 2; torso.position.y = -1.12; torso.scale.set(1, 1, 0.62);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.5, 16), skin); neck.position.y = -0.55;
  rig.add(torso, neck);

  const head = new THREE.Group();   // pivots at the base of the neck, so a nod bends from there
  head.position.y = -0.45;
  rig.add(head);
  const face = new THREE.Group(); face.position.y = 0.88; head.add(face);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), skin); skull.scale.set(0.62, 0.72, 0.64);
  face.add(skull);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), std(0xd29a72)); nose.scale.set(0.06, 0.075, 0.07); nose.position.set(0, -0.04, 0.64);
  face.add(nose);
  const ears = [-1, 1].map((side) => { const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skin); ear.scale.set(0.05, 0.1, 0.07); ear.position.set(side * 0.62, 0, 0); face.add(ear); return ear; });

  const hair = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.52), std(HAIR[tutor], { roughness: 0.9 }));
  hair.scale.set(0.655, 0.76, 0.68); hair.position.set(0, 0.03, -0.05); hair.rotation.x = -0.42;
  const cap = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 18, 0, Math.PI * 2, 0, Math.PI * 0.5), std(0xb9853f));
  dome.scale.set(0.68, 0.62, 0.7); dome.position.y = 0.2;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 28, 1, false, -Math.PI / 2, Math.PI), std(0xa5753a)); brim.position.set(0, 0.2, 0.46); brim.scale.z = 0.8; brim.rotation.y = 0;
  cap.add(dome, brim);
  face.add(hair, cap);

  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Group(); eye.position.set(side * 0.24, 0.1, 0.55);
    const white = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), std(0xfbf8f0, { roughness: 0.4 })); white.scale.set(0.095, 0.1, 0.06);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), std(0x24302d, { roughness: 0.3 })); pupil.scale.set(0.05, 0.055, 0.03); pupil.position.z = 0.04;
    eye.add(white, pupil); face.add(eye);
    return { eye, pupil, side };
  });
  const brows = [-1, 1].map((side) => { const brow = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.03, 0.03), std(HAIR[tutor])); brow.position.set(side * 0.24, 0.27, 0.58); face.add(brow); return { brow, side }; });
  const cheeks = [-1, 1].map((side) => { const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), new THREE.MeshBasicMaterial({ color: 0xe0856a, transparent: true, opacity: 0 })); cheek.position.set(side * 0.34, -0.16, 0.55); cheek.rotation.y = side * 0.5; face.add(cheek); return cheek; });

  const glasses = new THREE.Group();
  for (const side of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 10, 32), std(0x24302d, { roughness: 0.4 })); ring.position.set(side * 0.24, 0.1, 0.6); glasses.add(ring); }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 8), std(0x24302d)); bridge.rotation.z = Math.PI / 2; bridge.position.set(0, 0.11, 0.62); glasses.add(bridge);
  face.add(glasses);

  const mouth = new THREE.Group(); mouth.position.set(0, -0.27, 0.58); face.add(mouth);
  const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), std(0x5a2a24, { roughness: 0.6 })); inner.scale.set(0.1, 0.01, 0.03); inner.position.z = -0.01;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.016, 8, 28, Math.PI), std(0xb5584a, { roughness: 0.5 })); lip.rotation.z = Math.PI;
  mouth.add(inner, lip);

  const setTutor = (next) => {
    skin.color.setHex(SKIN[next]); torso.material.color.setHex(TOP[next]); hair.material.color.setHex(HAIR[next]);
    for (const { brow } of brows) brow.material.color.setHex(HAIR[next]);
    glasses.visible = next === 'mentor'; hair.visible = next === 'mentor'; cap.visible = next === 'senior';
  };
  setTutor(tutor);
  return { rig, head, face, torso, eyes, brows, cheeks, mouth, inner, lip, setTutor, ears };
}

export async function createMentor(host, { tutor = 'mentor' } = {}) {
  const stage = createStage(host, { fov: 27, position: [0, 0.35, 5.3], target: [0, 0.18, 0], shadows: false, floor: false });
  stage.key.position.set(-1.8, 2.6, 3.4);
  const bust = buildBust(tutor);
  stage.scene.add(bust.rig);
  bust.rig.position.y = -0.1;

  const want = { state: 'idle', mood: 'calm', level: 0 };
  const now = { open: 0, smile: 0.3, brow: 0, lift: 0, tilt: 0, nod: 0, lookX: 0, lookY: 0, blink: 1, cheek: 0 };
  const pointer = { x: 0, y: 0 };
  const onMove = (event) => {
    const box = host.getBoundingClientRect();
    pointer.x = clamp(((event.clientX - (box.left + box.width / 2)) / (innerWidth / 2)), -1, 1);
    pointer.y = clamp(((event.clientY - (box.top + box.height / 2)) / (innerHeight / 2)), -1, 1);
  };
  globalThis.addEventListener('pointermove', onMove, { passive: true });
  let nextBlink = 1.8, blinkAt = -1, shownLevel = 0;

  stage.add({
    run(delta, time) {
      const k = Math.min(1, delta * 6);
      shownLevel = lerp(shownLevel, want.level, Math.min(1, delta * 14));
      const speaking = want.state === 'speaking', listening = want.state === 'listening', thinking = want.mood === 'thinking';
      const userTalking = listening && shownLevel > 0.12;

      // what the face is aiming for
      const mood = want.mood;
      const aim = { smile: 0.28, brow: 0, lift: 0, tilt: 0, cheek: 0, lookX: pointer.x * 0.9, lookY: -pointer.y * 0.7 };
      if (mood === 'happy') Object.assign(aim, { smile: 1, brow: 0.35, cheek: 0.55 });
      if (mood === 'gentle') Object.assign(aim, { smile: -0.15, brow: -0.7, tilt: 0.07 });
      if (thinking) Object.assign(aim, { smile: 0.05, brow: 0.5, tilt: 0.14, lookX: 0.6, lookY: 0.8 });
      for (const key of ['smile', 'brow', 'lift', 'tilt', 'cheek', 'lookX', 'lookY']) now[key] = lerp(now[key], aim[key], k);
      now.open = lerp(now.open, speaking ? clamp(shownLevel * 1.7) : 0, Math.min(1, delta * 18));

      // breathing, a nod while the student talks, a little life while the tutor does
      const breathe = Math.sin(time * 1.6);
      bust.rig.position.y = -0.1 + breathe * 0.012;
      bust.torso.scale.y = 1 + breathe * 0.015;
      const nod = userTalking ? Math.sin(time * 5.2) * 0.05 * clamp(shownLevel * 3) : 0;
      now.nod = lerp(now.nod, nod, Math.min(1, delta * 10));
      bust.head.rotation.x = now.nod + (speaking ? Math.sin(time * 2.4) * 0.025 * clamp(shownLevel * 2) : 0) - now.lookY * 0.12;
      bust.head.rotation.y = now.lookX * 0.2 + (speaking ? Math.sin(time * 1.3) * 0.04 : 0);
      bust.head.rotation.z = now.tilt + Math.sin(time * 0.9) * 0.01;

      // eyes: follow the look target, blink now and then
      if (time > nextBlink && blinkAt < 0) { blinkAt = time; nextBlink = time + 2.2 + Math.random() * 3.4; }
      let blink = 1;
      if (blinkAt >= 0) { const p = (time - blinkAt) / 0.16; blink = p >= 1 ? 1 : 1 - Math.sin(p * Math.PI) * 0.92; if (p >= 1) blinkAt = -1; }
      for (const { eye, pupil } of bust.eyes) { eye.scale.y = blink; pupil.position.x = now.lookX * 0.035; pupil.position.y = now.lookY * 0.03; }

      // brows, cheeks, mouth
      for (const { brow, side } of bust.brows) { brow.position.y = 0.27 + now.brow * 0.035; brow.rotation.z = side * now.brow * -0.28; }
      for (const cheek of bust.cheeks) cheek.material.opacity = now.cheek * 0.5;
      bust.lip.scale.set(1 - now.open * 0.25, now.smile * 0.55 + 0.04, 1);
      bust.lip.position.y = now.open * -0.04;
      bust.inner.scale.set(0.09 + now.open * 0.02, 0.008 + now.open * 0.085, 0.03);
      bust.inner.position.y = now.open * -0.045;
    },
  });

  return {
    setLevel(level) { want.level = clamp(level); },
    set({ state, mood, tutor: next }) { if (state) want.state = state; if (mood) want.mood = mood; if (next) bust.setTutor(next); },
    dispose() { globalThis.removeEventListener('pointermove', onMove); stage.dispose(); },
  };
}

/** A rigged GLB, if the project ships one: morph targets named like ARKit blendshapes or Oculus visemes drive the same states. */
export async function createRiggedMentor(host) {
  const [{ GLTFLoader }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js')]);
  const gltf = await new GLTFLoader().loadAsync(modelUrl());
  const stage = createStage(host, { fov: 24, position: [0, 1.62, 1.55], target: [0, 1.55, 0], shadows: false, floor: false });
  stage.scene.add(gltf.scene);
  const meshes = [];
  gltf.scene.traverse((node) => { if (node.morphTargetDictionary) meshes.push(node); });
  const drive = (names, value) => { for (const mesh of meshes) for (const name of names) { const index = mesh.morphTargetDictionary[name]; if (index !== undefined) mesh.morphTargetInfluences[index] = value; } };
  const want = { state: 'idle', mood: 'calm', level: 0 };
  let shown = 0, nextBlink = 2;
  stage.add({ run(delta, time) {
    shown = lerp(shown, want.level, Math.min(1, delta * 14));
    drive(['jawOpen', 'mouthOpen', 'viseme_aa'], want.state === 'speaking' ? clamp(shown * 1.5) : 0);
    drive(['mouthSmile', 'mouthSmileLeft', 'mouthSmileRight'], want.mood === 'happy' ? 0.8 : 0.2);
    drive(['browInnerUp'], want.mood === 'gentle' || want.mood === 'thinking' ? 0.6 : 0);
    const closing = time > nextBlink && time < nextBlink + 0.15;
    drive(['eyeBlinkLeft', 'eyeBlinkRight', 'eyesClosed'], closing ? 1 : 0);
    if (time > nextBlink + 0.15) nextBlink = time + 2.5 + Math.random() * 3;
    gltf.scene.position.y = Math.sin(time * 1.6) * 0.003;
  } });
  return {
    setLevel(level) { want.level = clamp(level); },
    set({ state, mood }) { if (state) want.state = state; if (mood) want.mood = mood; },
    dispose() { stage.dispose(); },
  };
}

export async function createBestMentor(host, options) {
  if (modelUrl()) { try { return await createRiggedMentor(host); } catch (error) { console.warn('the mentorModel GLB could not be used; drawing the built-in mentor', error); } }
  return createMentor(host, options);
}
