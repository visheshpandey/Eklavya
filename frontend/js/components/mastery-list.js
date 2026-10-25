// One clickable bar per topic. Row elements are reused between renders so width changes animate.
import { el } from '../lib/dom.js';
import { masteryLevel } from '../lib/format.js';
import { selectDashboard, selectSelectedTopicId } from '../state/selectors.js';

export function mountMasteryList({ store, root, onOpenTopic }) {
  const rows = new Map();   // topicId -> {node, fill, value, name}

  function createRow(topicId) {
    const name = el('span', { class: 'mname' });
    const fill = el('span', { class: 'mfill', style: 'width:0%' });
    const value = el('span', { class: 'mval' });
    const node = el('div', { class: 'mrow', role: 'button', tabindex: '0', title: 'Open this topic' }, name, el('span', { class: 'mtrack' }, fill), value);
    const open = () => onOpenTopic(topicId);
    node.addEventListener('click', open);
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    return { node, fill, value, name, fresh: true };
  }

  function render() {
    const { dashboard, selectedTopicId } = store.getState();
    if (!dashboard) { root.replaceChildren(el('p', { class: 'empty', text: 'Loading…' })); return; }
    if (!dashboard.mastery.length) {
      rows.clear();
      root.replaceChildren(el('p', { class: 'empty', text: 'No notes yet. Load the demo notes or upload your own.' }));
      return;
    }
    const weakestId = dashboard.weak_topics[0]?.topic_id;
    const ids = new Set(dashboard.mastery.map((m) => m.topic_id));
    for (const id of [...rows.keys()]) if (!ids.has(id)) rows.delete(id);

    const ordered = dashboard.mastery.map((m) => {
      const row = rows.get(m.topic_id) ?? createRow(m.topic_id);
      rows.set(m.topic_id, row);
      const percent = Math.round(m.mastery_score);
      row.node.className = `mrow ${masteryLevel(percent)}${m.topic_id === weakestId ? ' weakest' : ''}${m.topic_id === selectedTopicId ? ' selected' : ''}`;
      row.name.textContent = m.topic_name;
      row.value.textContent = `${percent}%`;
      if (row.fresh) { row.fresh = false; requestAnimationFrame(() => { row.fill.style.width = `${percent}%`; }); }
      else row.fill.style.width = `${percent}%`;
      return row.node;
    });
    // Re-inserting an unchanged list would restart the CSS transition, so only touch the DOM when the set changed.
    const current = [...root.children];
    if (current.length !== ordered.length || current.some((node, i) => node !== ordered[i])) root.replaceChildren(...ordered);
  }

  store.select(selectDashboard, render);
  store.select(selectSelectedTopicId, render);
}
