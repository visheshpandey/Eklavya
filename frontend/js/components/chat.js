// Live transcript bubbles. Bubbles are updated in place while the tutor is still speaking.
// A shared photo shows as a small picture in the student's bubble.
import { el } from '../lib/dom.js';
import { selectMessages } from '../state/selectors.js';

export function mountChat({ store, root }) {
  const bubbles = [];   // bubbles[i] shows messages[i]

  function createBubble(message) {
    const text = el('p');
    const node = el('div', { class: `msg ${message.role}` },
      el('span', { class: 'who', text: message.role === 'user' ? 'You' : 'Eklavya' }),
      message.image ? el('img', { class: 'msg-photo', src: message.image, alt: 'The photo you shared', width: '160' }) : null,
      text);
    root.append(node);
    return { node, text };
  }

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
