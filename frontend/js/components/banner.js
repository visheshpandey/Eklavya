// Red error strip under the header.
import { selectBanner } from '../state/selectors.js';

export function mountBanner({ store, root }) {
  store.select(selectBanner, (message) => {
    root.textContent = message ?? '';
    root.hidden = !message;
  });
}
