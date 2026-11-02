// Live transcript bubbles. Bubbles are updated in place while the tutor is still speaking.
// A shared photo shows as a small picture in the student's bubble.
import { el } from '../lib/dom.js';
import { VOICE_STATUS } from '../lib/protocol.js';
import { selectMessages, selectVoiceStatus } from '../state/selectors.js';

export function mountChat({ store, root }) {
  const bubbles = [];   // bubbles[i] shows messages[i]

  function createBubble(message) {
    const text = el('p');
    const node = el('div', { class: `msg ${message.role}` },
      el('span', { class: 'who', text: message.role === 'user' ? 'You' : 'Eklavya' }),
      message.image ? el('img', { class: 'msg-photo', src: message.image, alt: 'The photo you shared', width: '160' }) : null,
      text);
    root.insertBefore(node, root.querySelector('.typing'));
    return { node, text };
  }

  // three soft dots while Eklavya is on its way to answering (connecting, or the student has spoken and no reply has started)
  const typing = el('div', { class: 'msg tutor typing', 'aria-hidden': 'true', hidden: '' }, el('span', { class: 'who', text: 'Eklavya' }), el('p', {}, el('i'), el('i'), el('i')));
  root.append(typing);
  const drawTyping = () => {
    const state = store.getState();
    const status = selectVoiceStatus(state), messages = selectMessages(state);
    typing.hidden = !(status === VOICE_STATUS.CONNECTING || (status !== VOICE_STATUS.IDLE && messages.at(-1)?.role === 'user'));
    root.append(typing);   // always last
    if (!typing.hidden) root.scrollTop = root.scrollHeight;
  };
  store.select(selectVoiceStatus, drawTyping);
  store.select(selectMessages, drawTyping);

  store.select(selectMessages, (messages) => {
    while (bubbles.length > messages.length) bubbles.pop().node.remove();   // a new session cleared the chat
    messages.forEach((message, i) => {
      const bubble = bubbles[i] ?? (bubbles[i] = createBubble(message));
      if (bubble.text.textContent !== message.text) bubble.text.textContent = message.text;
      bubble.node.classList.toggle('cut', Boolean(message.cut));
    });
    root.classList.toggle('has-msgs', messages.length > 0);
    root.scrollTop = root.scrollHeight;
  });
}
