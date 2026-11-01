// The concept map in 3D (3d-force-graph + three-spritetext): one sphere per topic, sized and coloured by mastery (terracotta under 50, gold 50-69,
// green 70 and up), weak topics pulse, a label appears on hover, a click flies the camera to the topic and selects it (the detail card with
// "Learn this" and "Test me" is the page's own), and the whole graph turns slowly until the student takes hold of it.
import { PALETTE, reducedMotion } from './env.js';
import { THREE } from './scene-kit.js';

const colorOf = (mastery) => (mastery < 50 ? PALETTE.terracotta : mastery < 70 ? PALETTE.gold : PALETTE.greenSoft);
let crowd = 1;   // many topics: bigger spheres, so they stay visible when the whole map is in view
const radiusOf = (mastery) => (4 + (mastery / 100) * 6) * crowd;

export async function createGraph(host, initialMap, { onPick }) {
  const { ForceGraph3D, SpriteText } = await import('../../vendor/force-graph.js');
  const calm = reducedMotion();
  const graph = ForceGraph3D({ controlType: 'orbit', rendererConfig: { antialias: true, alpha: true } })(host)
    .backgroundColor('rgba(0,0,0,0)')
    .showNavInfo(false)
    .nodeLabel(() => '')
    .nodeThreeObjectExtend(false)
    .linkColor(() => 'rgba(41,72,62,0.38)')
    .linkOpacity(0.7)
    .linkWidth((link) => 0.25 + link.weight * 0.35)
    .cooldownTime(4000)
    .nodeThreeObject((node) => {
      const group = new THREE.Group();
      const color = colorOf(node.mastery);
      const body = new THREE.Mesh(new THREE.SphereGeometry(radiusOf(node.mastery), 28, 20),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18, roughness: 0.55, metalness: 0.05 }));
      const label = new SpriteText(node.name, 3.2, PALETTE.ink);
      label.fontFace = 'DM Sans, sans-serif'; label.backgroundColor = 'rgba(250,248,242,0.94)'; label.padding = 1.6; label.borderRadius = 2;
      label.position.y = radiusOf(node.mastery) + 5; label.visible = false; label.material.depthTest = false; label.renderOrder = 10;
      group.add(body, label);
      node.__label = label;
      return group;
    });
  graph.renderer().setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  graph.camera().fov = 48; graph.camera().updateProjectionMatrix();   // a narrower lens: less stretching at the edges
  graph.scene().add(new THREE.HemisphereLight(0xfffaf0, 0x29483e, 0.9));

  const controls = graph.controls();
  controls.autoRotate = !calm; controls.autoRotateSpeed = 0.7; controls.enableDamping = true;
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

  // the pulse of the weak topics, on the same clock as the render loop
  let frame = 0, alive = true;
  const pulse = (time) => {
    if (!alive) return;
    if (!calm) for (const node of graph.graphData().nodes) if (node.mastery < 50 && node.__threeObj) node.__threeObj.scale.setScalar(1 + 0.14 * Math.sin(time / 330 + node.id));
    frame = requestAnimationFrame(pulse);
  };
  frame = requestAnimationFrame(pulse);

  const toData = (map) => { crowd = (map?.nodes?.length ?? 0) > 50 ? 1.7 : 1; return {
    nodes: (map?.nodes ?? []).map((n) => ({ id: n.id, name: n.topic, mastery: n.mastery })),
    links: (map?.links ?? []).map((l) => ({ source: l.source, target: l.target, weight: l.weight })),
  }; };
  let framed = false;
  graph.onEngineStop(() => { if (!framed) { framed = true; graph.zoomToFit(700, 12); } });   // once the layout settles, fit the whole map in view
  graph.graphData(toData(initialMap));

  const onVisibility = () => (document.hidden ? graph.pauseAnimation() : graph.resumeAnimation());
  document.addEventListener('visibilitychange', onVisibility);

  return {
    update(map) { graph.graphData(toData(map)); },
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
