// Short-lived messages at the bottom of the screen.
import { el } from '../lib/dom.js';
import { selectToasts } from '../state/selectors.js';

export function mountToasts({ store, root }) {
  store.select(selectToasts, (toasts) => {
    root.replaceChildren(...toasts.map((t) => el('div', { class: `toast ${t.kind}`, text: t.text })));
  });
}
