// "Connection lost. Reconnect?": shown in the Study screen when a call dropped and can be picked up again.
// The quiz, viva or debate on screen is kept, and the answer that was not sent goes out after reconnecting.
import { el, render } from '../lib/dom.js';
import { t } from '../lib/strings.js';
import { selectConnectionLost, selectLanguage } from '../state/selectors.js';

export function mountReconnectPrompt({ store, root, onReconnect }) {
  function draw() {
    const state = store.getState();
    const lost = selectConnectionLost(state);
    root.hidden = !lost;
    if (!lost) { render(root); return; }
    const language = selectLanguage(state);
    render(root, el('p', { class: 'reconnect-text', text: t('conn.lost', language) }),
      el('button', { class: 'btn btn-primary', type: 'button', onclick: onReconnect }, t('conn.reconnect', language)));
  }
  store.select(selectConnectionLost, draw);
  store.select(selectLanguage, draw);
  draw();
}
