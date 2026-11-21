// A study group in 3D: the shared book in the middle and one sphere per member orbiting it, joined to it by faint glowing lines. The student's own
// sphere is gold; the leader (rank 1) orbits closest. Names are page text pinned to each sphere (always readable, never over the book: see
// lib/orbit-labels.js). The group's real data is read from the page's leaderboard.
import { PALETTE } from './env.js';
import { THREE, createStage } from './scene-kit.js';
import { placeLabels } from '../lib/orbit-labels.js';
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

  const labels = document.createElement('div');   // the names (the leaderboard below says the same for screen readers)
  labels.className = 'o3-labels';
  labels.setAttribute('aria-hidden', 'true');
  host.append(labels);

  const orbiters = members.slice(0, 8).map((member, i, all) => {
    const color = member.you ? PALETTE.gold : COLORS[i % COLORS.length];
    const radius = 1.45 + (member.rank - 1) * 0.16;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(member.you ? 0.24 : 0.2, 28, 20), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, roughness: 0.5 }));
    sphere.castShadow = true;
    const label = document.createElement('span');
    label.className = `o3-label${member.you ? ' you' : ''}`;
    label.textContent = member.name.length > 15 ? `${member.name.slice(0, 14)}…` : member.name;
    labels.append(label);
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
    placeNames();
  } });

  const toScreen = (point, width, height) => { const v = point.clone().project(stage.camera); return { x: (v.x + 1) / 2 * width, y: (1 - v.y) / 2 * height }; };
  const bookBox = new THREE.Box3();
  function placeNames() {
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    bookBox.setFromObject(book);
    const corners = [];
    for (const x of [bookBox.min.x, bookBox.max.x]) for (const y of [bookBox.min.y, bookBox.max.y]) for (const z of [bookBox.min.z, bookBox.max.z]) corners.push(toScreen(new THREE.Vector3(x, y, z), width, height));
    const avoid = { left: Math.min(...corners.map((c) => c.x)), right: Math.max(...corners.map((c) => c.x)), top: Math.min(...corners.map((c) => c.y)), bottom: Math.max(...corners.map((c) => c.y)) };
    const items = orbiters.map((o) => {
      const centre = toScreen(o.sphere.position, width, height);
      const edge = toScreen(o.sphere.position.clone().add(new THREE.Vector3(0, o.sphere.geometry.parameters.radius, 0)), width, height);
      return { x: centre.x, y: centre.y, r: Math.abs(centre.y - edge.y), w: o.label.offsetWidth, h: o.label.offsetHeight };
    });
    placeLabels(items, avoid, { width, height }).forEach((spot, i) => { orbiters[i].label.style.transform = `translate(${spot.left}px, ${spot.top}px)`; });
  }

  return { dispose() { labels.remove(); stage.dispose(); } };
}
