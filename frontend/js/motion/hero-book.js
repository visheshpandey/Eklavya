// The Today hero in real 3D: a terracotta leather book that opens on load, its pages drawn from the student's own data ("Your next topic" with
// the mastery bar), a page that turns when the pointer is over the desk, two floating note cards, faint dust, and a slight parallax.
import { PALETTE } from './env.js';
import { THREE, canvasTexture, createStage, wrapText } from './scene-kit.js';

const W = 1.4, D = 1.9, STACK = 0.11, COVER = 0.05;
const HINGE_CLOSED = COVER + STACK + COVER / 2;   // height of the front cover's hinge while the book is shut
const PAPER = '#faf8f2', INK = PALETTE.ink, MUTE = '#8a7f69';
const SERIF = '"Instrument Serif", Georgia, serif', MONO = '"DM Mono", ui-monospace, monospace';
const barColor = (percent) => (percent < 50 ? PALETTE.terracotta : percent < 70 ? PALETTE.gold : PALETTE.greenSoft);
const ease = (t) => t * t * (3 - 2 * t);

function paper(ctx, w, h, spineSide) {   // cream paper with a soft shade where the page curves into the spine
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, w, h);
  const shade = ctx.createLinearGradient(spineSide === 'right' ? w : 0, 0, spineSide === 'right' ? w - 90 : 90, 0);
  shade.addColorStop(0, 'rgba(70,52,30,.20)'); shade.addColorStop(1, 'rgba(70,52,30,0)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
}
function label(ctx, text, x, y) { ctx.fillStyle = MUTE; ctx.font = `500 21px ${MONO}`; ctx.letterSpacing = '3px'; ctx.fillText(text.toUpperCase(), x, y); ctx.letterSpacing = '0px'; }
function rules(ctx, x, y, w, count) { ctx.strokeStyle = 'rgba(36,48,45,.16)'; ctx.lineWidth = 2; for (let i = 0; i < count; i += 1) { ctx.beginPath(); ctx.moveTo(x, y + i * 34); ctx.lineTo(x + w * (i === count - 1 ? 0.55 : 1), y + i * 34); ctx.stroke(); } }

const drawNext = (info) => (ctx, w, h) => {
  paper(ctx, w, h, 'right');
  const x = 56;
  label(ctx, info.topic ? 'Your next topic' : 'Your notes', x, 96);
  ctx.fillStyle = INK; ctx.font = `64px ${SERIF}`;
  wrapText(ctx, info.topic || 'Add your notes', w - 2 * x, 3).forEach((line, i) => ctx.fillText(line, x, 190 + i * 70));
  rules(ctx, x, 440, w - 2 * x, 3);
  if (info.topic) {
    const percent = Math.max(0, Math.min(100, Math.round(info.mastery ?? 0)));
    ctx.fillStyle = INK; ctx.font = `500 24px ${MONO}`; ctx.fillText(`${percent}% mastery`, x, 580);
    ctx.fillStyle = '#e3e9dc'; ctx.beginPath(); ctx.roundRect(x, 604, w - 2 * x, 22, 11); ctx.fill();
    ctx.fillStyle = barColor(percent); ctx.beginPath(); ctx.roundRect(x, 604, Math.max(22, ((w - 2 * x) * percent) / 100), 22, 11); ctx.fill();
  } else { ctx.fillStyle = MUTE; ctx.font = `italic 34px ${SERIF}`; ctx.fillText('ready when you are', x, 590); }
};
const drawWhere = () => (ctx, w, h) => {   // the leaf: hills and a line
  paper(ctx, w, h, 'left');
  label(ctx, 'Where you are', 70, 96);
  ctx.fillStyle = '#c9d6c3'; ctx.beginPath(); ctx.ellipse(w * 0.62, h * 0.66, w * 0.7, h * 0.2, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#8fae93'; ctx.beginPath(); ctx.ellipse(w * 0.3, h * 0.72, w * 0.55, h * 0.16, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = INK; ctx.font = `italic 38px ${SERIF}`; ctx.fillText('Pick up where', 70, 190); ctx.fillText('you left off.', 70, 236);
  rules(ctx, 70, 290, w - 140, 2);
};
const drawRoute = (info) => (ctx, w, h) => {   // the back of the leaf: today's three steps
  paper(ctx, w, h, 'right');
  label(ctx, "Today's route", 56, 96);
  ctx.fillStyle = INK; ctx.font = `46px ${SERIF}`;
  (info.steps?.length ? info.steps : ['Warm up', 'Learn something new', 'Check yourself']).slice(0, 3).forEach((step, i) => {
    ctx.fillStyle = PALETTE.terracotta; ctx.font = `500 24px ${MONO}`; ctx.fillText(String(i + 1).padStart(2, '0'), 56, 210 + i * 130);
    ctx.fillStyle = INK; ctx.font = `46px ${SERIF}`;
    wrapText(ctx, step, w - 160, 2).forEach((line, j) => ctx.fillText(line, 124, 212 + i * 130 + j * 46));
  });
};
const drawKeep = (info) => (ctx, w, h) => {
  paper(ctx, w, h, 'left');
  label(ctx, 'Keep it going', 70, 96);
  ctx.fillStyle = INK; ctx.font = `italic 110px ${SERIF}`; ctx.fillText(String(info.streak ?? 0), 70, 300);
  ctx.font = `italic 44px ${SERIF}`; ctx.fillText(info.streak === 1 ? 'day streak.' : 'day streak.', 70, 360);
  rules(ctx, 70, 430, w - 140, 2);
  ctx.fillStyle = MUTE; ctx.font = `500 22px ${MONO}`; ctx.fillText(`${info.open ?? 0} open mistake${info.open === 1 ? '' : 's'}`, 70, 560);
};
const drawCover = (ctx, w, h) => {   // leather: a base colour with fine grain, a gold frame and the name
  ctx.fillStyle = PALETTE.terracotta; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i += 1) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(60,24,12,.14)' : 'rgba(255,220,190,.10)';
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  ctx.strokeStyle = 'rgba(224,178,98,.75)'; ctx.lineWidth = 4; ctx.strokeRect(34, 34, w - 68, h - 68);
  ctx.strokeStyle = 'rgba(224,178,98,.4)'; ctx.lineWidth = 2; ctx.strokeRect(46, 46, w - 92, h - 92);
  ctx.fillStyle = 'rgba(236,196,120,.95)'; ctx.textAlign = 'center'; ctx.font = `italic 96px ${SERIF}`; ctx.fillText('eklavya', w / 2, h * 0.5);
  ctx.font = `500 20px ${MONO}`; ctx.letterSpacing = '5px'; ctx.fillText('YOUR STUDY SPACE', w / 2, h * 0.5 + 56); ctx.textAlign = 'left'; ctx.letterSpacing = '0px';
};
const drawSticky = (title, value) => (ctx, w, h) => {
  ctx.fillStyle = '#f3ead7'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#8a7f69'; ctx.font = `500 22px ${MONO}`; ctx.letterSpacing = '3px'; ctx.fillText(title.toUpperCase(), 26, 48); ctx.letterSpacing = '0px';
  ctx.fillStyle = '#3d4b3f'; ctx.font = `italic ${value.length > 4 ? 52 : 80}px ${SERIF}`; ctx.fillText(value, 26, 150);
};

function pageSide() { const m = new THREE.MeshStandardMaterial({ color: 0xeee6d2, roughness: 0.95 }); return m; }

export async function createHeroBook(desk, initial, { gsap = globalThis.gsap } = {}) {
  await document.fonts?.ready;
  let info = { ...initial };
  const stage = createStage(desk, { position: [0, 4.1, 3.7], target: [0, 0.2, 0.2] });
  const { scene, camera } = stage;
  const textures = [];
  const make = (w, h, draw) => { const made = canvasTexture(w, h, draw); textures.push(made); return made; };

  const next = make(512, 695, drawNext(info)), where = make(512, 695, drawWhere()), route = make(512, 695, drawRoute(info)), keep = make(512, 695, drawKeep(info));
  const cover = make(512, 695, drawCover);
  const bump = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i += 1) { const v = Math.floor(90 + Math.random() * 90); ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  });
  bump.texture.colorSpace = THREE.NoColorSpace; bump.texture.wrapS = bump.texture.wrapT = THREE.RepeatWrapping; bump.texture.repeat.set(3, 4);

  const leather = new THREE.MeshStandardMaterial({ map: cover.texture, bumpMap: bump.texture, bumpScale: 1.6, roughness: 0.7, metalness: 0.02 });
  const leatherPlain = new THREE.MeshStandardMaterial({ color: 0xa5543f, roughness: 0.78, bumpMap: bump.texture, bumpScale: 1.2 });
  const endpaper = new THREE.MeshStandardMaterial({ color: 0xe9e1cb, roughness: 0.9 });
  const page = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.92 });

  const book = new THREE.Group();
  scene.add(book);
  const box = (w, h, d, materials, x, y, z = 0) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; book.add(mesh); return mesh; };

  box(W + 0.04, COVER, D + 0.06, leatherPlain, W / 2 + 0.01, COVER / 2);                                                  // back cover
  const side = pageSide();
  box(W - 0.04, STACK, D, [side, side, page(keep.texture), side, side, side], W / 2, COVER + STACK / 2);              // right stack (top: keep it going)
  const spine = box(0.1, COVER + STACK * 0.6, D + 0.06, leatherPlain, -0.01, (COVER + STACK * 0.6) / 2);

  const leftGeometry = new THREE.BoxGeometry(W - 0.04, STACK, D);
  leftGeometry.translate(0, STACK / 2, 0);
  const left = new THREE.Mesh(leftGeometry, [side, side, page(next.texture), side, side, side]);                      // left stack (top: next topic), grows as the cover opens
  left.position.set(-W / 2, COVER, 0); left.scale.y = 0.001; left.castShadow = left.receiveShadow = true;
  book.add(left);

  const hinge = new THREE.Group();   // the front cover turns about the spine
  hinge.position.set(0, HINGE_CLOSED, 0);
  book.add(hinge);
  const front = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, COVER, D + 0.06), [leatherPlain, leatherPlain, leather, endpaper, leatherPlain, leatherPlain]);
  front.position.x = W / 2 + 0.01; front.castShadow = front.receiveShadow = true;
  hinge.add(front);

  const leafPivot = new THREE.Group();   // the page that turns when the pointer is over the desk
  leafPivot.position.set(0, COVER + STACK + 0.004, 0);
  book.add(leafPivot);
  const leafFront = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.06, D - 0.04), new THREE.MeshStandardMaterial({ map: where.texture, roughness: 0.92 }));
  leafFront.rotation.x = -Math.PI / 2; leafFront.position.x = W / 2; leafFront.castShadow = true;
  const leafBack = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.06, D - 0.04), new THREE.MeshStandardMaterial({ map: route.texture, roughness: 0.92 }));
  leafBack.rotation.x = Math.PI / 2; leafBack.position.set(W / 2, -0.0008, 0); leafBack.castShadow = true;
  route.texture.wrapS = route.texture.wrapT = THREE.RepeatWrapping; route.texture.repeat.set(-1, -1); route.texture.offset.set(1, 1);   // seen from the other side the picture would be mirrored
  leafPivot.add(leafFront, leafBack);

  // two floating note cards (upper right, lower left), as in the design
  const noteCards = [];
  function noteCard(title, valueOf, x, y, z, phase, tilt) {
    const made = make(320, 220, drawSticky(title, valueOf()));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.69, 0.02), [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: 0xf3ead7 })).concat([new THREE.MeshStandardMaterial({ map: made.texture, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0xe8dcc0 })]));
    mesh.castShadow = true; mesh.userData = { x, y, z, phase, tilt, made, title, valueOf };
    scene.add(mesh); noteCards.push(mesh);
  }
  noteCard('Open mistakes', () => String(info.open ?? 0), 2.0, 0.95, -0.3, 0, -0.12);
  noteCard('Keep it going', () => `${info.streak ?? 0}-day streak.`, -2.0, 0.9, 1.4, 2.1, 0.1);

  // dust: about 300 faint specks drifting up through the light
  const count = 300, positions = new Float32Array(count * 3), speeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) { positions.set([(Math.random() - 0.5) * 6.5, Math.random() * 2.8, (Math.random() - 0.5) * 3.6], i * 3); speeds[i] = 0.02 + Math.random() * 0.05; }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xfff1d0, size: 0.028, transparent: true, opacity: 0.45, depthWrite: false }));
  scene.add(dust);

  // the opening (a shut book that lifts, its cover turning over and its pages appearing)
  const progress = { open: 0 };
  const apply = () => {
    const t = progress.open;
    hinge.rotation.z = Math.PI * ease(t);
    hinge.position.y = HINGE_CLOSED + (COVER / 2 - HINGE_CLOSED) * ease(t);
    left.scale.y = Math.max(0.001, ease(Math.max(0, (t - 0.35) / 0.65)));
    book.position.x = -W / 2 * (1 - ease(t));
    book.position.y = (1 - ease(Math.min(1, t * 2))) * 0.05;
    book.rotation.y = -0.35 * (1 - ease(t));
    spine.scale.y = 1;
  };
  apply();
  let opened = false, started = false;
  const open = () => {
    if (started) return;
    started = true;
    if (gsap) gsap.to(progress, { open: 1, duration: 1.9, delay: 0.25, ease: 'power2.inOut', onUpdate: apply, onComplete: () => { opened = true; } });
    else { progress.open = 1; apply(); opened = true; }
  };

  // the page turn
  const leaf = { z: 0 };
  const turn = (to) => { if (!opened) return; gsap?.to(leaf, { z: to, duration: 1.05, ease: 'power2.inOut', overwrite: true, onUpdate: () => { leafPivot.rotation.z = leaf.z; } }); };
  desk.addEventListener('pointerenter', () => turn(Math.PI - 0.012));
  desk.addEventListener('pointerleave', () => turn(0));

  // parallax from the pointer, and the frame loop
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onMove = (event) => {
    const box2 = desk.getBoundingClientRect();
    pointer.tx = Math.max(-1, Math.min(1, ((event.clientX - box2.left) / box2.width - 0.5) * 2));
    pointer.ty = Math.max(-1, Math.min(1, ((event.clientY - box2.top) / box2.height - 0.5) * 2));
  };
  globalThis.addEventListener('pointermove', onMove, { passive: true });
  const base = camera.position.clone();
  let viewWidth = 6;
  stage.add({
    resize(width, height, cam) { viewWidth = 2 * Math.tan((cam.fov * Math.PI) / 360) * base.distanceTo(stage.lookAt) * (width / height); },
    run(delta, time) {
      if (!started && !desk.classList.contains('waiting')) open();
      pointer.x += (pointer.tx - pointer.x) * Math.min(1, delta * 3); pointer.y += (pointer.ty - pointer.y) * Math.min(1, delta * 3);
      camera.position.set(base.x + pointer.x * 0.45, base.y - pointer.y * 0.18, base.z + pointer.y * 0.1);
      if (opened) book.rotation.y = pointer.x * 0.1;
      const reach = Math.min(2.0, viewWidth / 2 - 1.05);
      for (const card of noteCards) {
        const { x, y, z, phase, tilt } = card.userData;
        card.position.set(Math.sign(x) * Math.min(Math.abs(x), reach), y + Math.sin(time * 1.1 + phase) * 0.06, z);
        card.rotation.set(-0.6 + Math.sin(time * 0.7 + phase) * 0.03, tilt + pointer.x * 0.08, Math.sin(time * 0.5 + phase) * 0.03);
      }
      const array = dustGeometry.attributes.position.array;
      for (let i = 0; i < count; i += 1) { array[i * 3 + 1] += speeds[i] * delta; array[i * 3] += Math.sin(time * 0.3 + i) * 0.0008; if (array[i * 3 + 1] > 2.8) array[i * 3 + 1] = 0; }
      dustGeometry.attributes.position.needsUpdate = true;
    },
  });

  desk.classList.add('is-3d');
  return {
    /** New numbers for the pages and cards. */
    update(next2) {
      const fresh = { ...info, ...next2 };
      if (JSON.stringify(fresh) === JSON.stringify(info)) return;
      info = fresh;
      next.redraw(drawNext(info)); keep.redraw(drawKeep(info)); route.redraw(drawRoute(info));
      for (const card of noteCards) card.userData.made.redraw(drawSticky(card.userData.title, card.userData.valueOf()));
    },
    dispose() {
      globalThis.removeEventListener('pointermove', onMove);
      gsap?.killTweensOf(progress); gsap?.killTweensOf(leaf);
      desk.classList.remove('is-3d');
      stage.dispose();
      for (const made of textures) made.texture.dispose();
    },
  };
}
