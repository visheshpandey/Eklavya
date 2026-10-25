// Section tabs (Notes | Study | Progress): click, arrow keys, Home/End. Follows the WAI-ARIA tabs pattern.
import { selectView } from '../state/selectors.js';

export function mountNavTabs({ store, app, tablist, onSelect }) {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const visible = () => tabs.filter((tab) => tab.offsetParent !== null);   // the Notes tab is hidden on wide screens

  store.select(selectView, (view) => {
    app.dataset.view = view;
    for (const tab of tabs) {
      const selected = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
  });

  tablist.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) onSelect(tab.dataset.view);
  });

  tablist.addEventListener('keydown', (event) => {
    const list = visible();
    const index = list.indexOf(document.activeElement);
    if (index < 0) return;
    const target = { ArrowRight: list[(index + 1) % list.length], ArrowLeft: list[(index - 1 + list.length) % list.length],
      Home: list[0], End: list[list.length - 1] }[event.key];
    if (!target) return;
    event.preventDefault();
    target.focus();
    onSelect(target.dataset.view);       // automatic activation: the panel follows the focused tab
  });
}
