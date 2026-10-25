// Type to the tutor instead of speaking. Only usable while a session is running.
import { selectTextInputEnabled } from '../state/selectors.js';

export function mountTextInput({ store, form, input, button, onSend }) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    onSend(text);
    input.value = '';
  });
  store.select(selectTextInputEnabled, (enabled) => {
    input.disabled = !enabled;
    button.disabled = !enabled;
  });
}
