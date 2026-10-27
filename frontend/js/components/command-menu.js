// Command menu (Ctrl+K / Cmd+K): search pages, topics and actions, move with the arrow keys, Enter to run.
// Also owns the one-letter shortcuts (T, Q, M, D, U), which only fire when you are not typing in a field.
import { el, render } from '../lib/dom.js';
import { selectDashboard, selectSelectedTopicId } from '../state/selectors.js';

const isTyping = (target) => target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable]'));

export function mountCommandMenu({ store, dialog, trigger, actions, topics, pages }) {
  const input = el('input', {
    class: 'cmd-input', type: 'search', placeholder: 'Search pages, topics and actions', autocomplete: 'off',
    role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'cmd-list', 'aria-label': 'Search pages, topics and actions',
  });
  const list = el('div', { id: 'cmd-list', class: 'cmd-list', role: 'listbox' });
  const foot = el('div', { class: 'cmd-foot' },
    el('span', {}, el('kbd', {}, '↑'), el('kbd', {}, '↓'), ' to move'),
    el('span', {}, el('kbd', {}, 'Enter'), ' to open'),
    el('span', { class: 'cmd-foot-end' }, el('kbd', {}, 'Ctrl'), el('kbd', {}, 'K'), ' opens this anywhere'));
  dialog.append(el('div', { class: 'cmd-search' }, input, el('kbd', { 'aria-hidden': 'true' }, 'Esc')), list, foot);

  let items = [];
  let active = 0;

  function build() {
    const state = store.getState();
    const topicId = selectSelectedTopicId(state);
    const topicList = topics(state);
    const topicName = topicList.find((topic) => topic.topic_id === topicId)?.topic_name;
    const weakest = selectDashboard(state)?.weak_topics?.[0]?.topic_id;

    const actionItems = actions.map((action) => {
      const blocked = action.needsTopic && topicId == null;
      return { ...action, group: 'Actions', disabled: blocked, hint: blocked ? 'Pick a topic first' : (action.needsTopic ? topicName : action.hint) };
    });
    const pageItems = pages.map((page) => ({ ...page, group: 'Pages' }));
    const topicItems = topicList.map((topic) => ({
      group: 'Topics', badge: String(Math.round(topic.mastery_score)), label: topic.topic_name,
      hint: `${topic.topic_id === weakest ? 'Weakest · ' : ''}${topic.document}`, run: () => topic.open(),
    }));

    const all = [...actionItems, ...pageItems, ...topicItems];
    const q = input.value.trim().toLowerCase();
    items = q ? all.filter((item) => `${item.label} ${item.hint ?? ''}`.toLowerCase().includes(q)) : all;
    active = Math.max(0, items.findIndex((item) => !item.disabled));
    draw();
  }

  function draw() {
    const nodes = [];
    let group = null;
    items.forEach((item, index) => {
      if (item.group !== group) { group = item.group; nodes.push(el('p', { class: 'cmd-group', role: 'presentation' }, group)); }
      nodes.push(el('button', {
        type: 'button', class: 'cmd-item', role: 'option', id: `cmd-${index}`, 'aria-selected': String(index === active),
        disabled: item.disabled || null, onclick: () => run(item),
        onmousemove: () => { if (active !== index && !item.disabled) { active = index; mark(); } },
      },
      el('span', { class: 'cmd-badge', 'aria-hidden': 'true' }, item.badge ?? item.key ?? ''),
      el('span', { class: 'cmd-text' }, el('span', { class: 'cmd-label' }, item.label), item.hint ? el('span', { class: 'cmd-hint' }, item.hint) : null),
      item.key ? el('kbd', { 'aria-hidden': 'true' }, item.key) : null));
    });
    if (!items.length) nodes.push(el('p', { class: 'cmd-empty' }, `Nothing matches “${input.value.trim()}”.`));
    render(list, nodes);
    input.setAttribute('aria-activedescendant', items.length ? `cmd-${active}` : '');
  }

  function mark() {
    list.querySelectorAll('.cmd-item').forEach((node, index) => node.setAttribute('aria-selected', String(index === active)));
    input.setAttribute('aria-activedescendant', `cmd-${active}`);
    list.querySelector(`#cmd-${active}`)?.scrollIntoView({ block: 'nearest' });
  }

  function move(step) {
    if (!items.length) return;
    let next = active;
    for (let i = 0; i < items.length; i++) {
      next = (next + step + items.length) % items.length;
      if (!items[next].disabled) break;
    }
    active = next;
    mark();
  }

  function run(item) {
    if (item.disabled) return;
    dialog.close();
    item.run();
  }

  function open() {
    if (dialog.open) return;
    input.value = '';
    build();
    dialog.showModal();
    input.focus();
  }

  input.addEventListener('input', build);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Enter' && items[active]) { event.preventDefault(); run(items[active]); }
  });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });   // a click on the scrim closes it
  trigger.addEventListener('click', open);

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (dialog.open) dialog.close(); else open();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || dialog.open || isTyping(event.target) || document.querySelector('dialog[open]')) return;
    const action = actions.find((a) => a.key.toLowerCase() === event.key.toLowerCase());
    if (!action || (action.needsTopic && selectSelectedTopicId(store.getState()) == null)) return;
    event.preventDefault();
    action.run();
  });

  return { open };
}
