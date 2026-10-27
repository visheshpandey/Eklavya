// "Your notes": topics grouped by the notes they came from. Search, fold a group, open a topic, remove a document.
// Row elements are reused between renders so the mastery bars animate instead of jumping.
import { el, render as replaceContent, svgEl, syncChildren } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/strings.js';
import { selectCollapsedDocs, selectDashboard, selectLanguage, selectLibrarySearch, selectSelectedTopicId } from '../state/selectors.js';

const CONFIRM_TIMEOUT_MS = 8000;
const RING_R = 11;
const RING_C = 2 * Math.PI * RING_R;

function setRing(circle, percent) {
  circle.setAttribute('stroke-dasharray', `${(RING_C * percent) / 100} ${RING_C}`);
  circle.setAttribute('class', percent >= 60 ? 'ring-ok' : percent >= 45 ? 'ring-warn' : 'ring-low');
}

export function mountLibrary({ store, root, searchInput, onOpenTopic, onToggleDocument, onSearch, onRemoveDocument }) {
  const rows = new Map();     // topicId -> row parts
  const groups = new Map();   // documentId -> group parts

  searchInput.addEventListener('input', () => onSearch(searchInput.value));

  function createRow(topicId) {
    const label = el('span', { class: 'topic-label' });
    const tag = el('span', { class: 'tag-weak', hidden: true });
    const name = el('span', { class: 'topic-name' }, label, tag);
    const pct = el('span', { class: 'topic-pct' });
    const fill = svgEl('circle', { cx: 15, cy: 15, r: RING_R, fill: 'none', 'stroke-width': 3.5, 'stroke-linecap': 'round',
      'stroke-dasharray': `0 ${RING_C}`, transform: 'rotate(-90 15 15)' });
    const ring = svgEl('svg', { class: 'topic-ring', width: 30, height: 30, viewBox: '0 0 30 30', 'aria-hidden': 'true' },
      svgEl('circle', { class: 'topic-ring-track', cx: 15, cy: 15, r: RING_R, fill: 'none', 'stroke-width': 3.5 }), fill);
    const node = el('button', { class: 'topic-row', type: 'button', onclick: () => onOpenTopic(topicId) }, ring, name, pct);
    return { node, label, tag, pct, fill, fresh: true };
  }

  function createGroup(documentId) {
    const title = el('span', { class: 'doc-name' });
    const count = el('span', { class: 'doc-count' });
    const listId = `topics-${documentId}`;
    const toggle = el('button', { class: 'doc-toggle', type: 'button', 'aria-controls': listId, onclick: () => onToggleDocument(documentId) },
      icon('caret-down', { size: 18 }), el('span', { class: 'doc-text' }, title, count));
    const remove = el('button', { class: 'btn btn-danger-quiet doc-remove', type: 'button' }, 'Remove');
    const confirmText = el('p');
    const yes = el('button', { class: 'btn btn-danger', type: 'button' }, 'Yes, remove');
    const no = el('button', { class: 'btn btn-secondary', type: 'button' }, 'Cancel');
    const confirmBox = el('div', { class: 'doc-confirm', role: 'group', hidden: true }, confirmText, el('div', { class: 'doc-confirm-actions' }, yes, no));
    const list = el('div', { class: 'topic-list', id: listId });
    let timer = null;

    const ask = (on) => {   // confirmation inside the page: a browser pop-up can be blocked and look like a dead button
      remove.hidden = on;
      confirmBox.hidden = !on;
      clearTimeout(timer);
      if (on) { yes.focus(); timer = setTimeout(() => ask(false), CONFIRM_TIMEOUT_MS); }
      else remove.focus();
    };
    remove.addEventListener('click', () => ask(true));
    no.addEventListener('click', () => ask(false));
    yes.addEventListener('click', () => { yes.disabled = no.disabled = true; onRemoveDocument(documentId); });

    const node = el('div', { class: 'doc' }, el('div', { class: 'doc-head' }, toggle, remove), confirmBox, list);
    return { node, title, count, toggle, list, remove, confirmText, yes, no };
  }

  function draw() {
    const { dashboard, selectedTopicId, ui } = store.getState();
    const language = selectLanguage(store.getState());
    const query = ui.librarySearch.trim().toLowerCase();
    if (searchInput.value !== ui.librarySearch) searchInput.value = ui.librarySearch;

    if (!dashboard) { replaceContent(root, el('p', { class: 'empty', text: t('lib.loading', language) })); return; }
    if (!dashboard.mastery.length) {
      rows.clear(); groups.clear();
      replaceContent(root, el('div', { class: 'empty-state' }, el('strong', { text: t('lib.noneTitle', language) }),
        el('p', { text: t('lib.noneBody', language) })));
      return;
    }

    const weakestId = dashboard.weak_topics[0]?.topic_id;
    const byDocument = new Map();
    for (const topic of dashboard.mastery) {
      if (!byDocument.has(topic.document_id)) byDocument.set(topic.document_id, { id: topic.document_id, name: topic.document, topics: [] });
      byDocument.get(topic.document_id).topics.push(topic);
    }
    for (const id of [...rows.keys()]) if (!dashboard.mastery.some((t) => t.topic_id === id)) rows.delete(id);
    for (const id of [...groups.keys()]) if (!byDocument.has(id)) groups.delete(id);

    const nodes = [];
    for (const doc of byDocument.values()) {
      const matches = query ? doc.topics.filter((t) => t.topic_name.toLowerCase().includes(query)) : doc.topics;
      if (!matches.length) continue;
      const group = groups.get(doc.id) ?? createGroup(doc.id);
      groups.set(doc.id, group);
      const collapsed = !query && Boolean(ui.collapsedDocs[doc.id]);       // a search opens every group that has a match
      group.title.textContent = doc.name;
      group.count.textContent = query ? t('lib.matches', language, { n: matches.length, total: doc.topics.length }) : t('lib.topics', language, { n: doc.topics.length });
      group.toggle.setAttribute('aria-expanded', String(!collapsed));
      group.list.hidden = collapsed;
      group.remove.textContent = t('lib.remove', language);
      group.remove.setAttribute('aria-label', t('lib.removeNamed', language, { name: doc.name }));
      group.yes.textContent = t('lib.yes', language);
      group.no.textContent = t('lib.cancel', language);
      group.confirmText.textContent = t('lib.confirm', language, { name: doc.name });

      syncChildren(group.list, matches.map((topic) => {
        const row = rows.get(topic.topic_id) ?? createRow(topic.topic_id);
        rows.set(topic.topic_id, row);
        const percent = Math.round(topic.mastery_score);
        row.label.textContent = topic.topic_name;
        row.tag.hidden = topic.topic_id !== weakestId;
        row.tag.textContent = t('lib.weakest', language);
        row.pct.textContent = `${percent}%`;
        row.node.setAttribute('aria-current', topic.topic_id === selectedTopicId ? 'true' : 'false');
        if (row.fresh) { row.fresh = false; requestAnimationFrame(() => setRing(row.fill, percent)); }
        else setRing(row.fill, percent);
        return row.node;
      }));
      nodes.push(group.node);
    }
    if (!nodes.length) nodes.push(el('p', { class: 'empty', text: t('lib.noMatch', language, { query: ui.librarySearch.trim() }) }));
    syncChildren(root, nodes);
  }

  store.select(selectDashboard, draw);
  store.select(selectSelectedTopicId, draw);
  store.select(selectLibrarySearch, draw);
  store.select(selectCollapsedDocs, draw);
  store.select(selectLanguage, draw);
}
