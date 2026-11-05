// The Study room's way in, from the new design: a ring of your topics you can drag or turn with the arrow keys, and six ways to study
// (learn, test, revise, viva, debate, free talk). Picking a topic selects it (the topic card below shows its notes); a mode starts a
// real voice session on it. The weakest topic is the default so a mode always has something to work on.
import { el, render } from '../lib/dom.js';
import { frontIndex, orbitPositions, orbitRadius, orbitTag, turnBy } from '../lib/orbit.js';
import { MASTERY_HELP } from '../lib/progress-text.js';
import { selectDashboard, selectSelectedTopicId, selectView } from '../state/selectors.js';

const MAX_TOPICS = 8;

export function mountStudyLaunch({ store, orbit, ring, modes, startTalk, studyFor, onPick, onStart, onAddNotes, reduceMotion = false }) {
  let angle = 0;
  let paused = false;
  let drag = null;
  let moved = false;
  let frame = null;
  let last = 0;
  let velocity = 0;   // degrees per millisecond left over from a flick; it fades out by itself
  let lastDragX = 0, lastDragAt = 0;
  let nodes = [];
  let topics = [];

  const choices = () => [...(selectDashboard(store.getState())?.mastery ?? [])].sort((a, b) => a.mastery_score - b.mastery_score).slice(0, MAX_TOPICS);

  function layout() {
    const radius = orbitRadius(orbit.clientWidth || 600);
    orbitPositions(nodes.length, angle).forEach((p) => {
      const node = nodes[p.index];
      node.style.transform = `rotateY(${p.degrees.toFixed(2)}deg) translateZ(${radius.toFixed(0)}px)`;
      node.style.opacity = String(p.opacity);
      node.style.pointerEvents = p.back ? 'none' : '';
      node.tabIndex = p.back ? -1 : 0;
      if (p.back) node.setAttribute('aria-hidden', 'true'); else node.removeAttribute('aria-hidden');
    });
  }

  function tick(time) {
    const dt = last ? Math.min(64, time - last) : 16;
    last = time;
    if (!drag && Math.abs(velocity) > 0.0004) { angle += velocity * dt; velocity *= 0.94 ** (dt / 16); }
    else if (!paused && !drag && !reduceMotion) angle -= dt * 0.012;
    layout();
    frame = requestAnimationFrame(tick);
  }
  const start = () => { if (!frame && nodes.length) { last = 0; frame = requestAnimationFrame(tick); } };
  const stop = () => { if (frame) { cancelAnimationFrame(frame); frame = null; } };

  function drawTopics() {
    topics = choices();
    const selected = selectSelectedTopicId(store.getState());
    nodes = topics.map((topic, index) => el('button', { class: 'onode', type: 'button', 'data-topic': String(topic.topic_id), 'aria-pressed': String(topic.topic_id === selected),
      onclick: () => onPick(topic.topic_id) },
    el('small', { text: orbitTag(topic.mastery_score, index === 0 && topics.length > 1 && topic.mastery_score < 60) }), topic.topic_name));
    render(ring, nodes);
    orbit.querySelector('.orbit-empty')?.remove();
    if (!nodes.length) {
      orbit.append(el('div', { class: 'orbit-empty' }, el('b', { text: 'No topics yet' }), el('span', { text: 'Add your notes and your topics will turn here.' }),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: onAddNotes }, 'Add notes ↗')));
    }
    layout();
    drawSelected();
    if (selectView(store.getState()) === 'study') start();   // topics arrived while the room is open: begin turning
  }

  function drawSelected() {
    const id = selectSelectedTopicId(store.getState());
    nodes.forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.topic === String(id))));
    const topic = topics.find((t) => t.topic_id === id) ?? (id != null ? (selectDashboard(store.getState())?.mastery ?? []).find((t) => t.topic_id === id) : null);
    studyFor.title = MASTERY_HELP;
    studyFor.textContent = topic ? `Studying: ${topic.topic_name} · ${Math.round(topic.mastery_score)}% mastery` : topics.length ? `No topic picked: modes use ${topics[0].topic_name}, your weakest.` : 'Just talk to Eklavya, or add notes to study a topic.';
  }

  const chosenTopic = () => selectSelectedTopicId(store.getState()) ?? topics[0]?.topic_id ?? null;

  modes.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mode]');
    if (!button) return;
    const mode = button.dataset.mode;
    if (mode === 'free') { onStart('free', null); return; }
    const topicId = chosenTopic();
    if (topicId == null) { onAddNotes(); return; }
    // a debate needs a side: Eklavya argues "for" in a friendly way and picks the motion; the topic card below can change that
    onStart(mode, topicId, mode === 'debate' ? { side: 'for', motion: '', style: 'friendly' } : undefined);
  });
  startTalk.addEventListener('click', () => onStart('free', null));

  orbit.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') paused = true; });
  orbit.addEventListener('pointerleave', (event) => { if (event.pointerType === 'mouse') paused = false; });
  orbit.addEventListener('focusin', () => { paused = true; });
  orbit.addEventListener('focusout', () => { paused = false; });
  orbit.addEventListener('pointerdown', (event) => { drag = { x: event.clientX, from: angle }; moved = false; velocity = 0; lastDragX = event.clientX; lastDragAt = performance.now(); });
  globalThis.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) > 6) { moved = true; orbit.classList.add('dragging'); }
    angle = drag.from + dx * 0.35;
    const at = performance.now();
    if (at > lastDragAt) velocity = (0.35 * (event.clientX - lastDragX)) / Math.max(8, at - lastDragAt);   // the flick's speed
    lastDragX = event.clientX; lastDragAt = at;
  });
  globalThis.addEventListener('pointerup', () => { if (drag) { drag = null; orbit.classList.remove('dragging'); if (performance.now() - lastDragAt > 90 || reduceMotion) velocity = 0; } });
  orbit.addEventListener('click', (event) => { if (moved) { event.stopPropagation(); event.preventDefault(); moved = false; } }, true);   // a drag is not a click
  orbit.addEventListener('keydown', (event) => {
    const step = turnBy(nodes.length, event.key);
    if (!step) return;
    event.preventDefault();
    angle += step;
    layout();
    nodes[frontIndex(nodes.length, angle)]?.focus();
  });

  store.select(selectDashboard, drawTopics);
  store.select(selectSelectedTopicId, drawSelected);
  store.select(selectView, (view) => { if (view === 'study') { layout(); start(); } else stop(); });
  return { redraw: drawTopics };
}
