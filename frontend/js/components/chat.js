// Live transcript bubbles. Bubbles are updated in place while the tutor is still speaking.
// A shared photo shows as a small picture in the student's bubble.
import { el } from '../lib/dom.js';
import { isRepeat } from '../lib/chat-repeat.js';
import { SLOW_TEXT, createTypingTimer } from '../lib/typing-timeout.js';
import { VOICE_STATUS } from '../lib/protocol.js';
import { selectMessages, selectVoiceStatus } from '../state/selectors.js';

export function mountChat({ store, root, onRetry = null, schedule, cancel }) {
  const bubbles = [];   // bubbles[i] shows messages[i]
  // follow the newest message only while the reader is at (or near) the bottom: someone who scrolled up to read is not yanked back down
  const atBottom = () => root.scrollHeight - root.scrollTop - root.clientHeight < 48;
  const follow = (wasAtBottom) => { if (wasAtBottom) root.scrollTop = root.scrollHeight; };

  function createBubble(message) {
    const text = el('p');
    const retry = message.retry && onRetry ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => onRetry() }, 'Retry') : null;
    const node = el('div', { class: `msg ${message.role}` },
      el('span', { class: 'who', text: message.role === 'user' ? 'You' : 'Eklavya' }),
      message.image ? el('img', { class: 'msg-photo', src: message.image, alt: 'The photo you shared', width: '160' }) : null,
      text, retry);
    root.insertBefore(node, root.querySelector('.typing'));
    return { node, text, role: message.role, image: message.image };
  }

  // three soft dots while Eklavya is on its way to answering (connecting, or the student has spoken and no reply has started)
  const typing = el('div', { class: 'msg tutor typing', 'aria-hidden': 'true', hidden: '' }, el('span', { class: 'who', text: 'Eklavya' }), el('p', {}, el('i'), el('i'), el('i')));
  root.append(typing);
  const dots = typing.querySelector('p');
  // the dots never run for more than 15 s: then a sentence says what is happening
  const slowTimer = createTypingTimer({ schedule, cancel, onSlow: () => { dots.textContent = SLOW_TEXT; typing.classList.add('is-slow'); typing.setAttribute('aria-hidden', 'false'); } });
  const resetDots = () => { dots.replaceChildren(el('i'), el('i'), el('i')); typing.classList.remove('is-slow'); typing.setAttribute('aria-hidden', 'true'); };
  const drawTyping = () => {
    const stick = atBottom();
    const state = store.getState();
    const status = selectVoiceStatus(state), messages = selectMessages(state);
    typing.hidden = !(status === VOICE_STATUS.CONNECTING || (status !== VOICE_STATUS.IDLE && messages.at(-1)?.role === 'user'));
    if (typing.hidden) { slowTimer.stop(); resetDots(); } else slowTimer.start();
    root.append(typing);   // always last
    if (!typing.hidden) follow(stick);
  };
  store.select(selectVoiceStatus, drawTyping);
  store.select(selectMessages, drawTyping);

  store.select(selectMessages, (messages) => {
    const stick = atBottom() || messages.at(-1)?.role === 'user';   // the student's own message always brings the chat down
    while (bubbles.length > messages.length) bubbles.pop().node.remove();   // a new session cleared the chat
    let rebuilt = false;
    messages.forEach((message, i) => {
      // a bubble belongs to one speaker: if the message at this place is now somebody else's (the local first line was replaced by the student's own words),
      // it is rebuilt, so an answer can never appear under a "You" label
      if (bubbles[i] && (bubbles[i].role !== message.role || bubbles[i].image !== message.image)) { bubbles[i].node.remove(); bubbles[i] = null; rebuilt = true; }
      const bubble = bubbles[i] ?? (bubbles[i] = createBubble(message));
      if (bubble.text.textContent !== message.text) bubble.text.textContent = message.text;
      bubble.node.classList.toggle('cut', Boolean(message.cut));
      bubble.node.hidden = isRepeat(messages, i);   // the tutor saying the same question twice in a row is shown once
    });
    if (rebuilt) bubbles.forEach((b) => root.insertBefore(b.node, typing));   // back in conversation order
    root.classList.toggle('has-msgs', messages.length > 0);
    follow(stick);
  });
}
