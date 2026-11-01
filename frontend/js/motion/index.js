// Entry for the motion layer. It is loaded after the app is on screen and does nothing for "reduce motion"; if a library fails to load the
// app simply stays as it was (every effect is an addition, none is needed to use the page).
import { idle, reducedMotion } from './env.js';

export function startMotion(deps) {
  if (reducedMotion()) return;
  idle(() => import('./motion.js').then((module) => module.initMotion(deps)).catch((error) => console.warn('motion layer not started', error)));
}
