// Theme preference: "system" (follow the OS), "light" or "dark". Remembered in localStorage when it is available.
export const THEME_KEY = 'eklavya-theme';
const VALID = ['system', 'light', 'dark'];

export function loadTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return VALID.includes(saved) ? saved : 'system';
  } catch { return 'system'; }          // storage blocked (private window): just follow the system
}

export function saveTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* not remembered, still applied */ }
}

/** "system" removes the attribute so the OS setting (prefers-color-scheme) decides. */
export function applyTheme(theme, root = document.documentElement) {
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

export const nextTheme = (theme) => VALID[(VALID.indexOf(theme) + 1) % VALID.length];
