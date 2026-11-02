// "My notes": when notes are dropped or chosen, a 3D page floats down, curls toward the leather book and is swallowed by it; the book gives a little
// bounce. (The topic chips then pop in as the list updates; that part is in the motion layer.) It plays over the drop zone and frees itself after.
import { PALETTE } from './env.js';
import { THREE, canvasTexture, createStage } from './scene-kit.js';

export function createUploadFx(host, { gsap = globalThis.gsap } = {}) {
  const stage = createStage(host, { fov: 30, position: [0, 3.4, 5.2], target: [0, 0.4, 0] });
  stage.key.position.set(-2, 4.2, 3.2);
  const leather = new THREE.MeshStandardMaterial({ color: PALETTE.terracotta, roughness: 0.72 });
  const book = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.1), [leather, leather, new THREE.MeshStandardMaterial({ color: 0xa5543f, roughness: 0.75 }), leather, leather, leather]);
  block.position.y = 0.15; block.castShadow = block.receiveShadow = true;
  const pages = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 1.02), new THREE.MeshStandardMaterial({ color: 0xeee6d2, roughness: 0.95 }));
  pages.position.set(0.04, 0.15, 0.0); pages.scale.set(1, 0.9, 1.02);
  book.add(pages, block);
  book.position.set(0.9, 0, 0.1);
  stage.scene.add(book);

  const text = canvasTexture(256, 340, (ctx, w, h) => {
    ctx.fillStyle = '#faf8f2'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(36,48,45,.28)';
    for (let i = 0; i < 12; i += 1) ctx.fillRect(28, 40 + i * 24, i % 4 === 3 ? 110 : 200, 6);
    ctx.fillStyle = PALETTE.terracotta; ctx.fillRect(28, 20, 70, 8);
  });
  const page = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.82), new THREE.MeshStandardMaterial({ map: text.texture, side: THREE.DoubleSide, roughness: 0.9 }));
  page.castShadow = true; page.visible = false;
  stage.scene.add(page);

  let timeline = null;
  return {
    play() {
      if (!gsap) return;
      timeline?.kill();
      const path = { t: 0 };
      page.visible = true; page.scale.setScalar(1);
      timeline = gsap.timeline({ onComplete: () => { page.visible = false; } })
        .to(path, { t: 1, duration: 1.4, ease: 'power2.inOut', onUpdate: () => {
          const t = path.t;
          page.position.set(-2 + t * 2.6, 2.1 - t * 1.55 + Math.sin(t * Math.PI) * 0.5, 0.2 - t * 0.2);
          page.rotation.set(-0.5 + t * 1.1, Math.sin(t * 4) * 0.5, -0.6 + t * 0.6);
        } })
        .to(page.scale, { x: 0.25, y: 0.25, z: 0.25, duration: 0.25, ease: 'power2.in' })
        .to(book.scale, { y: 1.12, duration: 0.14, yoyo: true, repeat: 1, ease: 'power1.out' }, '<0.1');
    },
    dispose() { timeline?.kill(); text.texture.dispose(); stage.dispose(); },
  };
}
