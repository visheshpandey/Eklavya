// "Learning / Voice test / Summary" strip for guided sessions.
import { el } from '../lib/dom.js';
import { selectPhase } from '../state/selectors.js';

const LABEL = { teaching: 'Learning', test: 'Voice test', summary: 'Summary' };

export function mountPhaseBar({ store, root }) {
  store.select(selectPhase, (phase) => {
    root.hidden = !phase;
    root.replaceChildren(...(phase ? [el('span', { class: 'step', text: LABEL[phase.phase] ?? phase.phase }), el('span', { text: phase.topic })] : []));
  });
}
