// Interface language: fills every data-i18n label in the page and sets <html lang>, whenever the language changes.
import { t, uiLang } from '../lib/strings.js';
import { selectLanguage } from '../state/selectors.js';

export function mountI18n({ store, root = document }) {
  store.select(selectLanguage, (language) => {
    document.documentElement.lang = uiLang(language);
    for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n, language);
    for (const node of root.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = t(node.dataset.i18nPlaceholder, language);
    for (const node of root.querySelectorAll('[data-i18n-label]')) node.setAttribute('aria-label', t(node.dataset.i18nLabel, language));
  });
}
