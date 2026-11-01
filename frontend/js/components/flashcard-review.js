// Flashcards, from the new design: today's due cards one at a time on a card that flips in 3D (click, tap or Space), Previous and Next,
// and three ratings. Got it moves the card to a longer gap, Hard steps it back one box, Again brings it back today. The schedule is saved
// on the server. A "mock round" shuffles every card, known ones too, as practice that does not change the schedule.
import { el, render } from '../lib/dom.js';
import { selectView } from '../state/selectors.js';

const pad = (n) => String(n).padStart(2, '0');
const shuffled = (list) => [...list].map((item) => [Math.random(), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
// Space flips the card unless the student is typing or on a control that uses Space itself. A navigation tab does not need Space, so
// pressing it right after opening the screen still flips the card.
const isTyping = (target) => target instanceof Element && Boolean(target.closest('input, textarea, select, a, [contenteditable], button:not([role="tab"])'));

export function mountFlashcardReview({ store, root, onLoadDue, onLoadAll, onRate, today, sound, onNeedNotes }) {
  let queue = [];
  let pos = 0;
  let flipped = false;
  let mock = false;
  let total = 0;
  let loading = false;

  const current = () => queue[pos] ?? null;

  function pillText() {
    return mock ? `${queue.length} left in this round` : `${queue.length} due today`;
  }

  function draw() {
    const card = current();
    if (loading) { render(root, el('p', { class: 'hint', role: 'status', text: 'Loading your deck…' })); return; }
    if (!card) {
      render(root,
        el('span', { class: 'duepill' }, mock ? 'Round complete' : el('b', { text: '0' }), mock ? '' : ' due today'),
        el('div', { class: 'card3-empty' }, el('h3', { class: 'serif-sm', text: total ? 'All caught up.' : 'No cards yet.' }),
          el('p', { class: 'hint', text: total ? (mock ? 'That was every card. Your schedule is untouched.' : 'Come back tomorrow, start a mock round to practise everything, or reset today\'s deck.')
            : 'Make cards from your notes in "Your decks" below, and they will appear here for review.' }),
          mock ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => leaveMock() }, 'Back to today\'s deck') : null,
          !total ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: onNeedNotes }, 'Add notes') : null));
      return;
    }
    const long = (text) => (text.length > 90 ? ' long' : '');
    const face = el('button', { class: `card3${flipped ? ' flipped' : ''}`, type: 'button', id: 'fcard', 'aria-label': flipped ? 'Showing the answer. Flip back.' : 'Flip the card to see the answer', onclick: flip },
      el('span', { class: 'face' }, el('span', { class: 'mono', text: card.topic }), el('span', { class: `q${long(card.front)}`, text: card.front }), el('span', { class: 'mono', text: 'Tap or press Space to reveal' })),
      el('span', { class: 'face back' }, el('span', { class: 'mono', text: card.source === 'mistake' ? 'Answer · from a mistake' : 'Answer' }), el('span', { class: `q${long(card.back)}`, text: card.back })));
    render(root,
      el('span', { class: 'duepill', role: 'status' }, el('b', { text: String(queue.length) }), mock ? ' left in this round' : ' due today'),
      el('div', { class: 'flip' }, face),
      el('div', { class: 'fcctl' },
        el('button', { class: 'btn btn-secondary', type: 'button', disabled: queue.length < 2 ? '' : null, onclick: () => step(-1) }, '← Previous'),
        el('span', { class: 'mono tnum', text: `Card ${pad(pos + 1)} of ${pad(queue.length)}` }),
        el('button', { class: 'btn btn-primary', type: 'button', disabled: queue.length < 2 ? '' : null, onclick: () => step(1) }, 'Next →')),
      el('div', { class: 'rate' }, el('span', { class: 'mono', text: 'How did that feel?' }),
        ['again:Again', 'hard:Hard', 'known:Got it'].map((pair) => { const [value, label] = pair.split(':'); return el('button', { type: 'button', 'data-rate': value, onclick: () => rate(value) }, label); })),
      mock ? el('button', { class: 'linkbtn', type: 'button', onclick: () => leaveMock() }, 'End mock round') : null);
  }

  function flip() {
    if (!current()) return;
    flipped = !flipped;
    sound.pageTurn();
    root.querySelector('.card3')?.classList.toggle('flipped', flipped);
    root.querySelector('.card3')?.setAttribute('aria-label', flipped ? 'Showing the answer. Flip back.' : 'Flip the card to see the answer');
  }

  function step(by) {
    if (queue.length < 2) return;
    pos = (pos + by + queue.length) % queue.length;
    flipped = false;
    sound.pageTurn();
    draw();
  }

  async function rate(value) {
    const card = current();
    if (!card) return;
    let leaves = value === 'known';   // a card that is not done for today goes to the back of the deck
    if (!mock) {
      const result = await onRate(card, value);
      if (result?.due_on && result.due_on > today()) leaves = true;   // the server pushed it to a later day (Hard from a high box)
    }
    queue.splice(pos, 1);
    if (!leaves) queue.push(card);
    if (pos >= queue.length) pos = 0;
    flipped = false;
    sound.pageTurn();
    draw();
  }

  async function loadMock() {
    loading = true; draw();
    queue = shuffled(await onLoadAll());
    total = queue.length;
    pos = 0; flipped = false; loading = false;
    draw();
  }

  async function leaveMock() { mock = false; await refresh(); }

  /** Reload today's deck (or the mock round) from the server. */
  async function refresh() {
    if (mock) return;
    loading = true; draw();
    queue = await onLoadDue();
    total = queue.length || total;
    if (!queue.length) total = (await onLoadAll()).length;
    pos = 0; flipped = false; loading = false;
    draw();
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== ' ' || store.getState().ui.view !== 'flashcards' || isTyping(event.target) || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    flip();
  });
  store.select(selectView, (view) => { if (view === 'flashcards') refresh(); });

  return {
    refresh,
    /** A shuffled practice round over every card. */
    async startMock() { mock = true; await loadMock(); },
  };
}
