// While a debate runs: shows the motion and which side Eklavya is arguing, so you always know what you are arguing against.
import { render as replaceContent, el } from '../lib/dom.js';
import { SESSION_MODE, VOICE_STATUS } from '../lib/protocol.js';
import { selectPhase, selectVoiceStatus } from '../state/selectors.js';

export function mountDebateTag({ store, root }) {
  function draw() {
    const { voiceStatus, session } = store.getState();
    const phase = session.phase;
    if (session.mode !== SESSION_MODE.DEBATE || voiceStatus === VOICE_STATUS.IDLE || !phase || phase.phase !== 'debate') {
      root.hidden = true; replaceContent(root); return;
    }
    root.hidden = false;
    replaceContent(root,
      el('strong', { text: `Debate: ${phase.topic}` }),
      el('span', { text: phase.motion ? ` · Motion: ${phase.motion}` : ' · Eklavya will state the motion' }),
      el('span', { text: ` · Eklavya argues ${phase.side === 'against' ? 'against' : 'for'}` }));
  }
  store.select(selectPhase, draw);
  store.select(selectVoiceStatus, draw);
}
