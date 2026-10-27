// Lesson steps for guided sessions. A real sequence, so it is numbered: Learn, Test, Summary (Test only for "just test me").
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { SESSION_MODE, VOICE_STATUS } from '../lib/protocol.js';
import { selectPhase, selectSummary, selectVoiceStatus } from '../state/selectors.js';

const STEPS = { teaching: 'Learn', revise: 'Recap', test: 'Test', summary: 'Summary' };
export const ORDER = { [SESSION_MODE.LEARN]: ['teaching', 'test', 'summary'], [SESSION_MODE.TEST]: ['test', 'summary'],
  [SESSION_MODE.REVISE]: ['revise', 'test', 'summary'] };

/**
 * Which step is current: -1 if the session has no steps; the index of the phase on screen; and once the summary card is
 * shown the lesson is over, so every step (the last one too) counts as done and none is current.
 */
export function currentStep(steps, session) {
  if (!steps) return -1;
  return session.summary ? steps.length : steps.indexOf(session.phase?.phase ?? steps[0]);
}

export function mountStepper({ store, root }) {
  function draw() {
    const { voiceStatus, session } = store.getState();
    const steps = ORDER[session.mode];
    if (!steps || voiceStatus === VOICE_STATUS.IDLE) { root.hidden = true; replaceContent(root); return; }
    const current = currentStep(steps, session);
    root.hidden = false;
    replaceContent(root, ...steps.map((key, i) => el('li', { class: `step${i < current ? ' is-done' : ''}`, 'aria-current': i === current ? 'step' : null },
      i < current ? icon('check-circle', { size: 16 }) : el('span', { class: 'step-num', text: String(i + 1) }),
      el('span', { text: STEPS[key] }))));
  }
  store.select(selectPhase, draw);
  store.select(selectSummary, draw);
  store.select(selectVoiceStatus, draw);
}
