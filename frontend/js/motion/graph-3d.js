// The concept map in 3D (3d-force-graph + three-spritetext). One sphere per topic: its size follows how many notes it is built from, its colour the
// mastery scale (terracotta under 60, gold 60-79, green 80 and up; paper grey for a topic not started yet), weak topics pulse softly. Topics of one
// subject gather around the subject's own label even when nothing links them. Hover shows the full name and mastery, a click flies the camera to the
// topic and selects it (the detail card with "Learn this" and "Test me" is the page's own). The whole graph turns slowly until the student takes hold.
import { PALETTE, reducedMotion } from './env.js';
import { THREE } from './scene-kit.js';

export const colorFor = (mastery, started = true) => (!started ? '#b9b2a0' : mastery < 60 ? PALETTE.terracotta : mastery < 80 ? PALETTE.gold : PALETTE.greenSoft);
export const radiusFor = (notes = 1) => 6 + ((Math.min(Math.max(notes, 1), 12) - 1) / 11) * 8;   // 6 to 14 by how many notes a topic is built from
export const labelFor = (node) => `${node.name} · ${node.started === false ? 'not started' : `${Math.round(node.mastery)}%`}`;

/** Subject anchors on a ring (pure): where each subject's topics gather. */
export function subjectAnchors(subjects, radius = 70) {
  const names = [...new Set(subjects)];
  return new Map(names.map((name, i) => {
    const angle = (i / Math.max(1, names.length)) * Math.PI * 2;
    // mostly across the screen (wider than tall), with only a little depth, so the clusters fill the box instead of lining up behind each other
    return [name, { x: names.length === 1 ? 0 : Math.cos(angle) * radius * 1.5, y: names.length === 1 ? 0 : Math.sin(angle) * radius * 0.55, z: ((i % 3) - 1) * 18 }];
  }));
}

export async function createGraph(host, initialMap, { onPick }) {
  const { ForceGraph3D, SpriteText } = await import('../../vendor/force-graph.js');
  if (!host.clientWidth || !host.clientHeight) throw new Error('the map container has no size yet');
  const calm = reducedMotion();
  let anchors = new Map(), selectedId = null;
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
      const radius = radiusFor(node.notes);
      group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 20),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18, roughness: 0.55, metalness: 0.05 })));
      const text = new SpriteText(labelFor(node), 6, PALETTE.ink);   // about 6 world units tall: readable at the fitted zoom
      text.fontFace = 'DM Sans, sans-serif'; text.fontWeight = '600'; text.backgroundColor = 'rgba(250,248,242,0.96)'; text.padding = 2.4; text.borderRadius = 3;
      text.position.y = radius + 9; text.visible = node.id === selectedId; text.material.depthTest = false; text.renderOrder = 10;
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

  host.__graph = graph;   // for tests and the console
  const fit = (ms = 400) => { graph.zoomToFit(ms, 60); host.dataset.fits = String(Number(host.dataset.fits ?? 0) + 1); };
  let refit = null;
  const size = () => { if (host.clientWidth && host.clientHeight) { graph.width(host.clientWidth).height(host.clientHeight); clearTimeout(refit); refit = setTimeout(() => fit(300), 250); } };   // a new size: fit the whole map again
  const resizer = new ResizeObserver(size);
  resizer.observe(host); size();

  let hovered = null;
  const showLabels = () => { for (const n of graph.graphData().nodes) if (n.__label) n.__label.visible = n === hovered || n.id === selectedId; };   // only the hovered and the selected topic carry a label
  graph.onNodeHover((node) => {
    hovered = node;
    showLabels();
    host.style.cursor = node ? 'pointer' : 'grab';
  });
  const fly = (node) => {
    if (!node) return;
    const distance = 70, ratio = 1 + distance / Math.max(1, Math.hypot(node.x, node.y, node.z));
    graph.cameraPosition({ x: node.x * ratio, y: node.y * ratio, z: node.z * ratio }, node, 1100);
    controls.autoRotate = false;
  };
  graph.onNodeClick((node) => { selectedId = node.id; showLabels(); fly(node); onPick(node.id); });

  // topics of one subject are pulled toward that subject's anchor (a soft cluster force), and the subject is named there
  let subjectLabels = [];
  const clusterForce = (() => {
    let nodes = [];
    const force = (alpha) => { for (const node of nodes) { const a = anchors.get(node.subject); if (a) { node.vx += (a.x - node.x) * 0.3 * alpha; node.vy += (a.y - node.y) * 0.3 * alpha; node.vz += (a.z - node.z) * 0.3 * alpha; } } };   // strong: OS, DBMS and ML separate clearly
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
    anchors = subjectAnchors(nodes.map((n) => n.subject), 62);
    for (const old of subjectLabels) { graph.scene().remove(old); old.material.map?.dispose(); old.material.dispose(); }
    subjectLabels = [...anchors].map(([name, p]) => {
      const sprite = new SpriteText(name.toUpperCase(), 11, '#5f564a');   // large: the subjects are what the eye should find first
      sprite.fontFace = 'DM Mono, monospace'; sprite.fontWeight = '600'; sprite.material.depthWrite = false; sprite.material.depthTest = false; sprite.renderOrder = 5; sprite.material.opacity = 0.9;
      sprite.position.set(p.x, p.y + 40, p.z);
      graph.scene().add(sprite);
      return sprite;
    });
    return { nodes, links: (map?.links ?? []).map((l) => ({ source: l.source, target: l.target, weight: l.weight })) };
  };
  let framed = false;
  graph.onEngineStop(() => { if (!framed) { framed = true; fit(600); } });   // once the layout settles, fit the whole map in view
  const onShown = () => { if (!document.hidden) fit(300); };
  document.addEventListener('visibilitychange', onShown);
  graph.graphData(toData(initialMap));

  const onVisibility = () => (document.hidden ? graph.pauseAnimation() : graph.resumeAnimation());
  document.addEventListener('visibilitychange', onVisibility);

  return {
    update(map) { framed = false; graph.graphData(toData(map)); },
    focus(id) { selectedId = id; showLabels(); fly(graph.graphData().nodes.find((n) => n.id === id)); },
    dispose() {
      alive = false; cancelAnimationFrame(frame); clearTimeout(resume);
      document.removeEventListener('visibilitychange', onVisibility); document.removeEventListener('visibilitychange', onShown); clearTimeout(refit);
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
