// Topics grouped by the notes they came from, one clickable bar per topic.
// Row elements are reused between renders so width changes animate.
import { el } from '../lib/dom.js';
import { masteryLevel } from '../lib/format.js';
import { selectDashboard, selectSelectedTopicId } from '../state/selectors.js';

export function mountMasteryList({ store, root, onOpenTopic, onRemoveDocument }) {
  const rows = new Map();     // topicId -> {node, fill, value, name, fresh}
  const groups = new Map();   // documentId -> {node, title, count}

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

  /** Group header: notes name, topic count and a Remove button that asks for confirmation in the page
   *  (a browser pop-up can be blocked, which made the old link look dead). */
  function createGroup(documentId) {
    const title = el('span', { class: 'mgroup-name' });
    const count = el('span', { class: 'mgroup-count' });
    const remove = el('button', { class: 'btn-remove mgroup-remove', type: 'button', title: 'Remove these notes and your progress on them' }, 'Remove');
    const yes = el('button', { class: 'btn-remove danger mgroup-confirm-yes', type: 'button' }, 'Yes, remove');
    const no = el('button', { class: 'btn-remove', type: 'button' }, 'Cancel');
    const confirmBox = el('span', { class: 'mgroup-confirm', hidden: true }, el('span', { class: 'mgroup-ask', text: 'Remove these notes and your progress?' }), yes, no);
    let timer = null;

    const ask = (on) => {
      remove.hidden = on;
      confirmBox.hidden = !on;
      clearTimeout(timer);
      if (on) { yes.focus(); timer = setTimeout(() => ask(false), 8000); }   // forget an unanswered question
    };
    remove.addEventListener('click', () => ask(true));
    no.addEventListener('click', () => ask(false));
    yes.addEventListener('click', () => { yes.disabled = no.disabled = true; onRemoveDocument(documentId); });

    return { node: el('div', { class: 'mgroup' }, title, count, remove, confirmBox), title, count };
  }

  function render() {
    const { dashboard, selectedTopicId } = store.getState();
    if (!dashboard) { root.replaceChildren(el('p', { class: 'empty', text: 'Loading…' })); return; }
    if (!dashboard.mastery.length) {
      rows.clear(); groups.clear();
      root.replaceChildren(el('p', { class: 'empty', text: 'No notes yet. Load the demo notes or upload your own.' }));
      return;
    }
    const weakestId = dashboard.weak_topics[0]?.topic_id;
    const topicIds = new Set(dashboard.mastery.map((m) => m.topic_id));
    const documentIds = new Set(dashboard.mastery.map((m) => m.document_id));
    for (const id of [...rows.keys()]) if (!topicIds.has(id)) rows.delete(id);
    for (const id of [...groups.keys()]) if (!documentIds.has(id)) groups.delete(id);

    const ordered = [];
    let lastDocument = null;
    for (const m of dashboard.mastery) {                       // the server sends topics grouped by document, newest first
      if (m.document_id !== lastDocument) {
        lastDocument = m.document_id;
        const group = groups.get(m.document_id) ?? createGroup(m.document_id);
        groups.set(m.document_id, group);
        const inGroup = dashboard.mastery.filter((x) => x.document_id === m.document_id).length;
        group.title.textContent = m.document;
        group.count.textContent = `${inGroup} topic${inGroup === 1 ? '' : 's'}`;
        ordered.push(group.node);
      }
      const row = rows.get(m.topic_id) ?? createRow(m.topic_id);
      rows.set(m.topic_id, row);
      const percent = Math.round(m.mastery_score);
      row.node.className = `mrow ${masteryLevel(percent)}${m.topic_id === weakestId ? ' weakest' : ''}${m.topic_id === selectedTopicId ? ' selected' : ''}`;
      row.name.textContent = m.topic_name;
      row.value.textContent = `${percent}%`;
      if (row.fresh) { row.fresh = false; requestAnimationFrame(() => { row.fill.style.width = `${percent}%`; }); }
      else row.fill.style.width = `${percent}%`;
      ordered.push(row.node);
    }
    // Re-inserting an unchanged list would restart the CSS transition, so only touch the DOM when the set changed.
    const current = [...root.children];
    if (current.length !== ordered.length || current.some((node, i) => node !== ordered[i])) root.replaceChildren(...ordered);
  }

  store.select(selectDashboard, render);
  store.select(selectSelectedTopicId, render);
}
