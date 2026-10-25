// Live transcript bubbles. Bubbles are updated in place while the tutor is still speaking.
import { el } from '../lib/dom.js';
import { selectMessages } from '../state/selectors.js';

export function mountChat({ store, root }) {
  const bubbles = [];   // bubbles[i] shows messages[i]

  function createBubble(role) {
    const text = el('p');
    const node = el('div', { class: `msg ${role}` }, el('span', { class: 'who', text: role === 'user' ? 'You' : 'Eklavya' }), text);
    root.append(node);
    return { node, text };
  }

  store.select(selectMessages, (messages) => {
    while (bubbles.length > messages.length) bubbles.pop().node.remove();   // a new session cleared the chat
    messages.forEach((message, i) => {
      const bubble = bubbles[i] ?? (bubbles[i] = createBubble(message.role));
      if (bubble.text.textContent !== message.text) bubble.text.textContent = message.text;
      bubble.node.classList.toggle('cut', Boolean(message.cut));
    });
    root.classList.toggle('has-msgs', messages.length > 0);
    root.scrollTop = root.scrollHeight;
  });
}
