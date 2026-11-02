// A study group in 3D: the shared book in the middle and one sphere per member orbiting it, joined to it by faint glowing lines. The student's own
// sphere is gold; the leader (rank 1) orbits closest. Names appear as small labels. The group's real data is read from the page's leaderboard.
import { PALETTE } from './env.js';
import { THREE, canvasTexture, createStage } from './scene-kit.js';

const SERIF = '"Instrument Serif", Georgia, serif';
const COLORS = [PALETTE.greenSoft, PALETTE.terracotta, '#7a9bb0', '#a98bb8', '#d1a35c', '#6fae9a'];

export function createGroupOrbit(host, members) {
  const stage = createStage(host, { fov: 30, position: [0, 2.7, 4.3], target: [0, 0.3, 0] });
  stage.key.position.set(-2.4, 4.4, 3);
  const leather = new THREE.MeshStandardMaterial({ color: PALETTE.terracotta, roughness: 0.72 });
  const book = new THREE.Group();
  const spine = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.9), leather);
  const pages = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.8), new THREE.MeshStandardMaterial({ color: 0xf2ead6, roughness: 0.95 }));
  pages.position.y = 0.04; spine.castShadow = true; book.add(spine, pages);
  book.position.y = 0.2;
  stage.scene.add(book);

  const orbiters = members.slice(0, 8).map((member, i, all) => {
    const color = member.you ? PALETTE.gold : COLORS[i % COLORS.length];
    const radius = 1.45 + (member.rank - 1) * 0.16;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(member.you ? 0.24 : 0.2, 28, 20), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, roughness: 0.5 }));
    sphere.castShadow = true;
    const label = canvasTexture(256, 72, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(250,248,242,.94)'; ctx.beginPath(); ctx.roundRect(4, 8, w - 8, h - 16, 16); ctx.fill();
      ctx.fillStyle = PALETTE.ink; ctx.font = `34px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillText(member.name.length > 15 ? `${member.name.slice(0, 14)}…` : member.name, w / 2, h / 2 + 11);
    });
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: label.texture, depthTest: false }));
    tag.scale.set(0.9, 0.25, 1); tag.position.y = 0.42; tag.renderOrder = 5;
    sphere.add(tag);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
    stage.scene.add(sphere, line);
    return { sphere, line, radius, phase: (i / all.length) * Math.PI * 2, speed: 0.32 - i * 0.015, tilt: (i % 3) * 0.12, label };
  });

  stage.add({ run(delta, time) {
    book.rotation.y = time * 0.12;
    for (const o of orbiters) {
      const angle = o.phase + time * o.speed;
      o.sphere.position.set(Math.cos(angle) * o.radius, 0.55 + Math.sin(time * 0.9 + o.phase) * 0.12 + Math.sin(angle) * o.tilt, Math.sin(angle) * o.radius * 0.8);
      o.line.geometry.setFromPoints([new THREE.Vector3(0, 0.3, 0), o.sphere.position]);
    }
  } });

  return { dispose() { for (const o of orbiters) o.label.texture.dispose(); stage.dispose(); } };
}
