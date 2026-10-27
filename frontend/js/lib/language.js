// Tutor language (Hinglish / English / Hindi), remembered in localStorage like the theme.
import { LANGUAGES } from './protocol.js';

export const LANGUAGE_KEY = 'eklavya.lang';
const VALID = Object.values(LANGUAGES);

export function loadLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    return VALID.includes(saved) ? saved : LANGUAGES.HINGLISH;
  } catch { return LANGUAGES.HINGLISH; }       // storage blocked (private window): use the default
}

export function saveLanguage(language) {
  try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* not remembered, still applied */ }
}
