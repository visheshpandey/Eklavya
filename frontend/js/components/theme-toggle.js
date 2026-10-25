// One button that cycles System -> Light -> Dark. Applies the theme and remembers it.
import { icon } from '../lib/icons.js';
import { applyTheme, nextTheme, saveTheme } from '../lib/theme.js';
import { selectTheme } from '../state/selectors.js';

const ICON = { system: 'desktop', light: 'sun', dark: 'moon' };
const LABEL = { system: 'follow system', light: 'light', dark: 'dark' };

export function mountThemeToggle({ store, button, onChange }) {
  button.addEventListener('click', () => onChange(nextTheme(store.getState().ui.theme)));
  store.select(selectTheme, (theme) => {
    applyTheme(theme);
    saveTheme(theme);
    button.replaceChildren(icon(ICON[theme]));
    button.setAttribute('aria-label', `Theme: ${LABEL[theme]}. Switch to ${LABEL[nextTheme(theme)]}.`);
    button.title = `Theme: ${LABEL[theme]}`;
  });
}
