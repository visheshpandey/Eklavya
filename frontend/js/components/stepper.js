// Lesson steps for guided sessions. A real sequence, so it is numbered: Learn, Test, Summary (Test only for "just test me").
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { SESSION_MODE, VOICE_STATUS } from '../lib/protocol.js';
import { selectPhase, selectVoiceStatus } from '../state/selectors.js';

const STEPS = { teaching: 'Learn', revise: 'Recap', test: 'Test', summary: 'Summary' };
const ORDER = { [SESSION_MODE.LEARN]: ['teaching', 'test', 'summary'], [SESSION_MODE.TEST]: ['test', 'summary'],
  [SESSION_MODE.REVISE]: ['revise', 'test', 'summary'] };

export function mountStepper({ store, root }) {
  function draw() {
    const { voiceStatus, session } = store.getState();
    const steps = ORDER[session.mode];
    if (!steps || voiceStatus === VOICE_STATUS.IDLE) { root.hidden = true; replaceContent(root); return; }
    const current = steps.indexOf(session.phase?.phase ?? steps[0]);
    root.hidden = false;
    replaceContent(root, ...steps.map((key, i) => el('li', { class: `step${i < current ? ' is-done' : ''}`, 'aria-current': i === current ? 'step' : null },
      i < current ? icon('check-circle', { size: 16 }) : el('span', { class: 'step-num', text: String(i + 1) }),
      el('span', { text: STEPS[key] }))));
  }
  store.select(selectPhase, draw);
  store.select(selectVoiceStatus, draw);
}
