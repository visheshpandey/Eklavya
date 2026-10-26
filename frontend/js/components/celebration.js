// A small, short moment for a real win (mastery up, a debate won, a streak). One chip rises and fades near the
// voice button; with reduced motion it simply appears. It is also spoken once through its live region.
import { selectCelebration } from '../state/selectors.js';

const SHOW_MS = 2200;

export function mountCelebration({ store, root }) {
  let timer = null;
  store.select(selectCelebration, (celebration) => {
    if (!celebration) return;
    clearTimeout(timer);
    root.textContent = celebration.text;
    root.hidden = false;
    root.classList.remove('is-on');
    void root.offsetWidth;            // restart the animation for back-to-back wins
    root.classList.add('is-on');
    timer = setTimeout(() => { root.hidden = true; root.classList.remove('is-on'); }, SHOW_MS);
  });
}
