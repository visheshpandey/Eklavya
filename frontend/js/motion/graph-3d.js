// The concept map in 3D (3d-force-graph + three-spritetext). One sphere per topic: its size follows how many notes it is built from, its colour the
// mastery scale (terracotta under 60, gold 60-79, green 80 and up; paper grey for a topic not started yet), weak topics pulse softly. Topics of one
// subject gather around the subject's own label even when nothing links them. Hover shows the full name and mastery, a click flies the camera to the
// topic and selects it (the detail card with "Learn this" and "Test me" is the page's own). The whole graph turns slowly until the student takes hold.
import { PALETTE, reducedMotion } from './env.js';
import { THREE } from './scene-kit.js';

export const colorFor = (mastery, started = true) => (!started ? '#b9b2a0' : mastery < 60 ? PALETTE.terracotta : mastery < 80 ? PALETTE.gold : PALETTE.greenSoft);
export const radiusFor = (notes = 1) => 3.6 + Math.min(Math.max(notes, 1), 12) * 0.55;
export const labelFor = (node) => `${node.name} · ${node.started === false ? 'not started' : `${Math.round(node.mastery)}%`}`;

/** Subject anchors on a ring (pure): where each subject's topics gather. */
export function subjectAnchors(subjects, radius = 70) {
  const names = [...new Set(subjects)];
  return new Map(names.map((name, i) => {
    const angle = (i / Math.max(1, names.length)) * Math.PI * 2;
    return [name, { x: names.length === 1 ? 0 : Math.cos(angle) * radius, y: ((i % 2) - 0.5) * 24, z: names.length === 1 ? 0 : Math.sin(angle) * radius }];
  }));
}

export async function createGraph(host, initialMap, { onPick }) {
  const { ForceGraph3D, SpriteText } = await import('../../vendor/force-graph.js');
  if (!host.clientWidth || !host.clientHeight) throw new Error('the map container has no size yet');
  const calm = reducedMotion();
  let crowd = 1, anchors = new Map();
  const graph = ForceGraph3D({ controlType: 'orbit', rendererConfig: { antialias: true, alpha: true } })(host)
    .backgroundColor('rgba(0,0,0,0)')
    .showNavInfo(false)
    .nodeLabel(() => '')
    .nodeThreeObjectExtend(false)
    .linkColor(() => 'rgba(41,72,62,0.38)')
    .linkOpacity(0.7)
    .linkWidth((link) => 0.25 + link.weight * 0.35)
    .cooldownTime(4500)
    .nodeThreeObject((node) => {
      const group = new THREE.Group();
      const color = colorFor(node.mastery, node.started);
      const radius = radiusFor(node.notes) * crowd;
      group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 20),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18, roughness: 0.55, metalness: 0.05 })));
      const text = new SpriteText(labelFor(node), 3.2, PALETTE.ink);
      text.fontFace = 'DM Sans, sans-serif'; text.backgroundColor = 'rgba(250,248,242,0.95)'; text.padding = 1.6; text.borderRadius = 2;
      text.position.y = radius + 5; text.visible = false; text.material.depthTest = false; text.renderOrder = 10;
      group.add(text);
      node.__label = text;
      return group;
    });
  graph.renderer().setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  graph.scene().add(new THREE.HemisphereLight(0xfffaf0, 0x29483e, 0.9));
  graph.camera().fov = 48; graph.camera().updateProjectionMatrix();

  const controls = graph.controls();
  Object.assign(controls, { autoRotate: !calm, autoRotateSpeed: 0.7, enableDamping: true, minDistance: 50, maxDistance: 520 });
  let resume = null;
  controls.addEventListener('start', () => { clearTimeout(resume); controls.autoRotate = false; });
  controls.addEventListener('end', () => { clearTimeout(resume); if (!calm) resume = setTimeout(() => { controls.autoRotate = true; }, 5000); });

  const size = () => { if (host.clientWidth && host.clientHeight) graph.width(host.clientWidth).height(host.clientHeight); };
  const resizer = new ResizeObserver(size);
  resizer.observe(host); size();

  let hovered = null;
  graph.onNodeHover((node) => {
    if (hovered?.__label) hovered.__label.visible = false;
    hovered = node;
    if (node?.__label) node.__label.visible = true;
    host.style.cursor = node ? 'pointer' : 'grab';
  });
  const fly = (node) => {
    if (!node) return;
    const distance = 70, ratio = 1 + distance / Math.max(1, Math.hypot(node.x, node.y, node.z));
    graph.cameraPosition({ x: node.x * ratio, y: node.y * ratio, z: node.z * ratio }, node, 1100);
    controls.autoRotate = false;
  };
  graph.onNodeClick((node) => { fly(node); onPick(node.id); });

  // topics of one subject are pulled toward that subject's anchor (a soft cluster force), and the subject is named there
  let subjectLabels = [];
  const clusterForce = (() => {
    let nodes = [];
    const force = (alpha) => { for (const node of nodes) { const a = anchors.get(node.subject); if (a) { node.vx += (a.x - node.x) * 0.06 * alpha; node.vy += (a.y - node.y) * 0.06 * alpha; node.vz += (a.z - node.z) * 0.06 * alpha; } } };
    force.initialize = (list) => { nodes = list; };
    return force;
  })();
  graph.d3Force('cluster', clusterForce);

  let frame = 0, alive = true;
  const pulse = (time) => {   // weak topics (started, under 60) breathe
    if (!alive) return;
    if (!calm) for (const node of graph.graphData().nodes) if (node.started !== false && node.mastery < 60 && node.__threeObj) node.__threeObj.scale.setScalar(1 + 0.14 * Math.sin(time / 330 + node.id));
    frame = requestAnimationFrame(pulse);
  };
  frame = requestAnimationFrame(pulse);

  const toData = (map) => {
    const nodes = (map?.nodes ?? []).map((n) => ({ id: n.id, name: n.topic, mastery: n.mastery, started: n.started !== false, notes: n.notes ?? 1, subject: n.subject ?? 'Notes' }));
    crowd = nodes.length > 50 ? 1.5 : 1;
    anchors = subjectAnchors(nodes.map((n) => n.subject), 40 + Math.min(nodes.length, 60));
    for (const old of subjectLabels) { graph.scene().remove(old); old.material.map?.dispose(); old.material.dispose(); }
    subjectLabels = [...anchors].map(([name, p]) => {
      const sprite = new SpriteText(name.toUpperCase(), 5, '#8a7f69');
      sprite.fontFace = 'DM Mono, monospace'; sprite.fontWeight = '500'; sprite.material.depthWrite = false; sprite.material.opacity = 0.85;
      sprite.position.set(p.x, p.y + 26, p.z);
      graph.scene().add(sprite);
      return sprite;
    });
    return { nodes, links: (map?.links ?? []).map((l) => ({ source: l.source, target: l.target, weight: l.weight })) };
  };
  let framed = false;
  graph.onEngineStop(() => { if (!framed) { framed = true; graph.zoomToFit(700, 18); } });   // once the layout settles, fit the whole map in view
  graph.graphData(toData(initialMap));

  const onVisibility = () => (document.hidden ? graph.pauseAnimation() : graph.resumeAnimation());
  document.addEventListener('visibilitychange', onVisibility);

  return {
    update(map) { framed = false; graph.graphData(toData(map)); },
    focus(id) { fly(graph.graphData().nodes.find((n) => n.id === id)); },
    dispose() {
      alive = false; cancelAnimationFrame(frame); clearTimeout(resume);
      document.removeEventListener('visibilitychange', onVisibility);
      resizer.disconnect();
      graph.pauseAnimation();
      graph.scene().traverse((object) => { object.geometry?.dispose?.(); for (const m of [].concat(object.material ?? [])) { m.map?.dispose?.(); m.dispose?.(); } });
      graph._destructor?.();
      graph.renderer().dispose();
      graph.renderer().forceContextLoss();
      host.replaceChildren();
    },
  };
}
