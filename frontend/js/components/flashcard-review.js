// Flashcards: one session, one card at a time. A large card sits on a deck that thins as you go. Space (or a click) flips it in 3D; only then do the
// three ratings appear: Again (1), Hard (2), Got it (3), each saying when the card will come back. A swipe or drag rates too (right Got it, left Again,
// up Hard; that gesture lives in the motion layer and presses these same buttons). The schedule is saved on the server: Got it moves a card up a Leitner
// box, Hard steps it back one, Again returns it today. The 3D shelf of boxes (motion layer) is told through "eklavya:cards" events.
// A "mock round" shuffles every card, known ones too, as practice that does not change the schedule. A summary closes every session.
import { el, render, svgEl } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { dueCount } from '../lib/cards.js';
import { selectToday, selectView } from '../state/selectors.js';
import { CIRCUMFERENCE, ringColor } from './mastery-ring.js';

const pad = (n) => String(n).padStart(2, '0');
const shuffled = (list) => [...list].map((item) => [Math.random(), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
const INTERVALS = ['today', '1 day', '3 days', '7 days', '14 days', '30 days'];   // days until a card in box 0..5 comes back
const COMBO_EVERY = 10;
// Space flips the card unless the student is typing or on a control that uses Space itself. A navigation tab does not need Space, so
// pressing it right after opening the screen still flips the card.
const isTyping = (target) => target instanceof Element && Boolean(target.closest('input, textarea, select, a, [contenteditable], button:not([role="tab"])'));
const nextBox = (box, value) => (value === 'known' ? Math.min(box + 1, 5) : value === 'hard' ? Math.max(box - 1, 0) : 0);
/** When a card rated `value` comes back (shown on the rating buttons). */
export const comesBack = (box, value) => (value === 'again' ? '<1 min' : INTERVALS[nextBox(Math.min(5, box ?? 0), value)]);

export function mountFlashcardReview({ store, root, onLoadDue, onLoadAll, onRate, today, sound, onNeedNotes, onSpeak = () => {} }) {
  let queue = [];
  let flipped = false;
  let mock = false;
  let total = 0;          // cards in the whole deck (for the empty state)
  let loading = false;
  let busy = false;       // a rating is being applied
  let summary = null;     // set when a session ends
  let live = '';          // what the screen reader hears
  let boxes = [0, 0, 0, 0, 0, 0];
  let session = fresh(0);

  function fresh(size) { return { size, done: 0, rated: 0, got: 0, hard: 0, again: 0, mistakes: [] }; }
  const announce = (detail) => {
    if (detail.type === 'counts') globalThis.eklavyaBoxes = detail.boxes;   // remembered, for a shelf that starts after the first announcement
    document.dispatchEvent(new CustomEvent('eklavya:cards', { detail }));
  };
  const current = () => queue[0] ?? null;

  function toast(text) {
    const note = el('p', { class: 'fc-combo', role: 'status', text });
    root.append(note);
    setTimeout(() => note.remove(), 2400);
  }

  function skeleton() {
    render(root, el('div', { class: 'fc-skeleton', role: 'status', 'aria-label': 'Loading your deck' },
      el('span', { class: 'skeleton sk-pill' }), el('span', { class: 'skeleton sk-card' }), el('span', { class: 'skeleton sk-line' })));
  }

  function empty() {
    render(root, el('div', { class: 'card3-empty' },
      el('h3', { class: 'serif-sm', text: total ? 'All caught up.' : 'No cards yet.' }),
      el('p', { class: 'hint', text: total ? 'Come back tomorrow, start a mock round to practise everything, or reset today\'s deck from the ⋯ menu.'
        : 'Make cards from your notes, and they will appear here for review.' }),
      el('button', { class: 'btn btn-primary', type: 'button', onclick: onNeedNotes }, 'Make cards from your notes')));
  }

  function drawSummary() {
    const rated = summary.got + summary.hard + summary.again;
    const accuracy = rated ? Math.round(((summary.got + summary.hard * 0.5) / rated) * 100) : 0;
    const tomorrow = boxes[1];   // the cards now waiting one day
    const ring = svgEl('svg', { viewBox: '0 0 120 120', class: 'mring-svg', role: 'img', 'aria-label': `Accuracy ${accuracy}%` },
      svgEl('circle', { class: 'bg', cx: 60, cy: 60, r: 44, fill: 'none', 'stroke-width': 9 }),
      svgEl('circle', { class: 'fg', cx: 60, cy: 60, r: 44, fill: 'none', 'stroke-width': 9, 'stroke-linecap': 'round', transform: 'rotate(-90 60 60)', 'data-circ': CIRCUMFERENCE.toFixed(2),
        style: `stroke:${ringColor(accuracy)};stroke-dasharray:${CIRCUMFERENCE.toFixed(2)};stroke-dashoffset:${(CIRCUMFERENCE * (1 - accuracy / 100)).toFixed(2)}` }),
      svgEl('text', { class: 'mring-num', x: 60, y: 64, 'text-anchor': 'middle' }, `${accuracy}%`),
      svgEl('text', { class: 'mring-cap', x: 60, y: 82, 'text-anchor': 'middle' }, 'ACCURACY'));
    live = `Session complete. ${summary.size} cards, ${accuracy} percent.`;
    render(root, el('div', { class: 'fc-summary' },
      el('span', { class: 'mono', text: mock ? 'Round complete' : 'Session complete' }),
      el('h3', { class: 'serif-sm', text: `${summary.size} card${summary.size === 1 ? '' : 's'} reviewed.` }),
      el('div', { class: 'mring' }, ring),
      el('p', { class: 'hint', text: `${summary.got} got it · ${summary.hard} hard · ${summary.again} again` }),
      mock ? el('p', { class: 'hint', text: 'A practice round: your schedule is untouched.' }) : el('p', { class: 'fc-tomorrow', text: `Come back tomorrow: ${tomorrow} due` }),
      el('div', { class: 'fc-summary-acts' },
        summary.mistakes.length ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: reviewMistakes }, `Review mistakes (${summary.mistakes.length})`) : null,
        el('button', { class: 'btn btn-primary', type: 'button', onclick: done }, 'Done')),
      el('p', { class: 'visually-hidden', role: 'status', text: live })));
    document.dispatchEvent(new CustomEvent('eklavya:celebrate', { detail: { near: '#fcReview' } }));
  }

  function draw() {
    if (loading) { skeleton(); return; }
    if (summary) { drawSummary(); return; }
    const card = current();
    if (!card) { empty(); return; }
    const long = (text) => (text.length > 90 ? ' long' : '');
    const position = Math.min(session.done + 1, session.size);
    if (!live) live = `Card ${position} of ${session.size}`;
    const face = el('button', { class: `card3${flipped ? ' flipped' : ''}`, type: 'button', id: 'fcard', 'aria-label': flipped ? 'Showing the answer. Flip back.' : 'Flip the card to see the answer', onclick: flip },
      el('span', { class: 'face' }, el('span', { class: 'mono', text: card.source === 'mistake' ? 'From a mistake' : 'Question' }), el('span', { class: `q${long(card.front)}`, text: card.front }), el('span', { class: 'mono', text: 'Space or click to flip' })),
      el('span', { class: 'face back' }, el('span', { class: 'mono', text: 'Answer' }), el('span', { class: `q${long(card.back)}`, text: card.back }), el('span', { class: 'mono', text: 'Rate it with 1, 2 or 3' })));
    const behind = Math.min(3, queue.length - 1);
    const rate = (value, label, key, tone) => el('button', { type: 'button', 'data-rate': value, 'data-tone': tone, disabled: flipped ? null : '', 'aria-keyshortcuts': key, onclick: () => rate_(value) },
      el('b', { text: label }), el('small', { class: 'mono', text: comesBack(card.box, value) }), el('kbd', { text: key }));
    render(root,
      el('div', { class: 'fc-head' },
        el('span', { class: 'chip-static' }, card.topic),
        el('span', { class: 'mono tnum', text: `${pad(position)} / ${pad(session.size)}` }),
        el('span', { class: 'duepill', role: 'status' }, el('b', { text: String(mock ? queue.length : dueCount(store.getState())) }), mock ? ' left in this round' : ' due today')),
      el('div', { class: 'fc-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(session.size), 'aria-valuenow': String(session.done), 'aria-label': 'Session progress' },
        el('span', { style: `width:${Math.round((session.done / Math.max(1, session.size)) * 100)}%` })),
      el('div', { class: 'fcstage' },
        Array.from({ length: behind }, (_, i) => el('span', { class: 'deckback', style: `--i:${behind - i}`, 'aria-hidden': 'true' })),
        el('div', { class: 'fc-float' }, el('div', { class: 'flip' }, face))),
      el('div', { class: 'fc-tools' },
        el('button', { class: 'btn btn-secondary btn-sm', type: 'button', 'aria-label': 'Read the question aloud', onclick: () => onSpeak(flipped ? card.back : card.front) }, icon('speaker-high', { size: 16 }), 'Listen'),
        mock ? el('button', { class: 'linkbtn', type: 'button', onclick: done }, 'End round') : null,
        el('span', { class: 'hint', text: flipped ? 'Swipe right: got it · left: again · up: hard' : 'Think of the answer first, then flip' })),
      el('div', { class: 'fc-rate', 'data-show': flipped ? '1' : null, role: 'group', 'aria-label': 'How did that feel?' },
        rate('again', 'Again', '1', 'again'), rate('hard', 'Hard', '2', 'hard'), rate('known', 'Got it', '3', 'known')),
      el('p', { id: 'fcLive', class: 'visually-hidden', role: 'status', 'aria-live': 'polite', text: live }));
    live = '';
  }

  function flip() {
    if (!current() || summary) return;
    flipped = !flipped;
    sound.pageTurn();
    root.querySelector('.card3')?.classList.toggle('flipped', flipped);
    root.querySelector('.card3')?.setAttribute('aria-label', flipped ? 'Showing the answer. Flip back.' : 'Flip the card to see the answer');
    const group = root.querySelector('.fc-rate');
    if (group) { if (flipped) group.dataset.show = '1'; else delete group.dataset.show; }
    root.querySelectorAll('.fc-rate button').forEach((button) => { button.disabled = !flipped; });
    const hint = root.querySelector('.fc-tools .hint');
    if (hint) hint.textContent = flipped ? 'Swipe right: got it · left: again · up: hard' : 'Think of the answer first, then flip';
  }

  async function rate_(value) {
    const card = current();
    if (!card || !flipped || busy) return;
    busy = true;
    const from = Math.min(5, card.box ?? 0), to = nextBox(from, value);
    announce({ type: 'rate', from, to, value });
    root.querySelector('.fcstage')?.classList.add('fc-leaving');
    let leaves = value === 'known';   // a card that is not done for today goes to the back of the deck
    if (!mock) {
      boxes = boxes.map((n, i) => n - (i === from ? 1 : 0) + (i === to ? 1 : 0));
      setTimeout(() => announce({ type: 'counts', boxes }), 1000);
      card.box = to;
      const result = await onRate(card, value);
      if (result?.due_on && result.due_on > today()) leaves = true;   // the server pushed it to a later day (Hard from a high box)
    }
    session.rated += 1; session[value === 'known' ? 'got' : value] += 1;
    if (value !== 'known') session.mistakes.push(card);
    queue.shift();
    if (leaves) session.done += 1; else queue.push(card);
    live = `${value === 'known' ? 'Got it' : value === 'hard' ? 'Hard' : 'Again'}. Comes back ${comesBack(from, value)}.`;
    if (session.rated % COMBO_EVERY === 0) toast(`${session.rated} cards in a row. Nice rhythm.`);
    flipped = false; busy = false;
    sound.pageTurn();
    if (!queue.length) { summary = { ...session, mistakes: [...new Map(session.mistakes.map((c) => [c.id, c])).values()] }; }
    draw();
  }

  function begin(cards) { queue = cards; session = fresh(cards.length); flipped = false; summary = null; live = ''; }

  async function loadMock() {
    loading = true; draw();
    const all = shuffled(await onLoadAll());
    total = all.length; mock = true;
    begin(all); loading = false;
    draw();
  }

  function reviewMistakes() { mock = true; begin(shuffled(summary.mistakes)); draw(); }   // a practice pass over what was missed; the schedule is already saved
  async function done() { summary = null; mock = false; await refresh(); }

  /** Reload today's deck from the server. */
  async function refresh() {
    if (mock && !summary) return;
    loading = true; draw();
    const [due, all] = await Promise.all([onLoadDue(), onLoadAll()]);   // together, so the extra request costs no waiting
    total = all.length;
    boxes = [0, 1, 2, 3, 4, 5].map((box) => all.filter((c) => Math.min(5, c.box ?? 0) === box).length);
    announce({ type: 'counts', boxes });
    begin(due); loading = false;
    draw();
  }

  document.addEventListener('keydown', (event) => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (store.getState().ui.view !== 'flashcards' || isTyping(event.target) || isTyping(document.activeElement) || document.querySelector('dialog[open]')) return;
    if (event.key === ' ') { event.preventDefault(); flip(); return; }
    const value = { 1: 'again', 2: 'hard', 3: 'known' }[event.key];
    if (value && flipped && !summary) { event.preventDefault(); rate_(value); }
  });
  store.select(selectView, (view) => { if (view === 'flashcards') refresh(); });
  store.select(selectToday, () => { const count = root.querySelector('.duepill b'); if (count && !mock) count.textContent = String(dueCount(store.getState())); });   // the header follows the same number as the sidebar badge

  return {
    refresh,
    /** A shuffled practice round over every card. */
    async startMock() { await loadMock(); },
  };
}
