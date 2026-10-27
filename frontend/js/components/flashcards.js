// Flashcards: pick a topic, have Eklavya write cards from the notes (plus one per past mistake), then flip through.
// Review mode: the cards due today across all topics; after each flip you say "Knew it" or "Didn't know", and the card
// comes back later (spaced repetition) or again this session. Keyboard: Enter/Space flips; Left/Right move; K / D answer.
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/strings.js';
import { selectDashboard, selectFlashcards, selectLanguage, selectSelectedTopicId, selectToday } from '../state/selectors.js';

export function mountFlashcards({ store, root, onLoad, onMake, onLoadDue, onReview }) {
  let review = null;   // {queue, at, flipped, known, again, retried:Set} while reviewing due cards
  let index = 0;
  let flipped = false;
  let busy = false;
  let chosen = null;   // topic picked in this card's own selector
  let requested = null; // topic whose cards were asked for (one request per topic, even if it fails)

  const topicId = () => chosen ?? selectSelectedTopicId(store.getState()) ?? selectDashboard(store.getState())?.weak_topics?.[0]?.topic_id ?? null;

  function move(step, total) {
    index = (index + step + total) % total;
    flipped = false;
    draw(true);
  }

  async function make() {
    const id = topicId();
    if (id == null) return;
    busy = true; draw();
    await onMake(id);
    busy = false; index = 0; flipped = false; draw();
  }

  async function startReview() {
    const cards = await onLoadDue();
    if (!cards?.length) return;
    review = { queue: cards, at: 0, flipped: false, known: 0, again: 0, retried: new Set() };
    draw(true);
  }

  async function answer(knew) {
    const card = review.queue[review.at];
    review[knew ? 'known' : 'again'] += 1;
    if (!knew && !review.retried.has(card.id)) { review.retried.add(card.id); review.queue.push(card); }   // once more, at the end
    review.at += 1;
    review.flipped = false;
    draw(true);
    onReview(card.id, knew);   // saved in the background; the next card does not wait for it
  }

  function drawReview(keepFocus) {
    const { queue, at } = review;
    if (at >= queue.length) {
      replaceContent(root, el('div', { class: 'review-done' },
        el('strong', { class: 'review-score', text: `${review.known} known, ${review.again} to practise` }),
        el('p', { class: 'hint', text: 'Cards you knew come back in a few days; the others come back tomorrow. Small and often works best.' }),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: () => { review = null; draw(); } }, 'Done')));
      if (keepFocus) root.querySelector('.review-done .btn')?.focus();
      return;
    }
    const card = queue[at];
    const face = el('button', { class: `flashcard${review.flipped ? ' is-flipped' : ''}`, type: 'button',
      'aria-label': `${review.flipped ? card.back : card.front}. ${review.flipped ? 'Answer shown' : 'Show the answer'}`,
      onclick: () => { review.flipped = !review.flipped; draw(true); } },
    el('span', { class: 'card-tag', text: card.topic }),
    el('span', { class: 'card-text', text: review.flipped ? card.back : card.front }),
    el('span', { class: 'card-hint', 'aria-hidden': 'true' }, icon('flip-horizontal', { size: 16 }), review.flipped ? 'Did you know it?' : 'Tap to see the answer'));
    const answers = review.flipped
      ? el('div', { class: 'review-answers' },
        el('button', { class: 'btn btn-secondary', type: 'button', 'aria-keyshortcuts': 'D', onclick: () => answer(false) }, icon('x', { size: 18 }), "Didn't know"),
        el('button', { class: 'btn btn-primary', type: 'button', 'aria-keyshortcuts': 'K', onclick: () => answer(true) }, icon('check-circle', { size: 18 }), 'Knew it'))
      : null;
    const deckNode = el('div', { class: 'cards-deck', onkeydown: (event) => {
      if (!review.flipped) return;
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); answer(true); }
      if (event.key.toLowerCase() === 'd') { event.preventDefault(); answer(false); }
    } },
    el('div', { class: 'review-head' },
      el('span', { class: 'hint', 'aria-live': 'polite', text: `Review: card ${at + 1} of ${queue.length}` }),
      el('button', { class: 'link-btn', type: 'button', onclick: () => { review = null; draw(); } }, 'Stop')),
    el('div', { class: 'review-bar', 'aria-hidden': 'true' }, el('span', { style: `width:${Math.round((at / queue.length) * 100)}%` })),
    face, answers);
    replaceContent(root, deckNode);
    if (keepFocus) (root.querySelector('.review-answers .btn-primary') ?? root.querySelector('.flashcard'))?.focus();
  }

  function draw(keepFocus = false) {
    if (review) { drawReview(keepFocus); return; }
    const state = store.getState();
    const language = selectLanguage(state);
    const topics = selectDashboard(state)?.mastery ?? [];
    const deck = selectFlashcards(state);
    const id = topicId();
    if (id != null && deck.topicId !== id && requested !== id) { requested = id; onLoad(id); }
    const cards = deck.topicId === id ? deck.cards : [];
    if (index >= cards.length) index = 0;

    const select = el('select', { class: 'select', id: 'cards-topic', onchange: () => { chosen = Number(select.value); index = 0; flipped = false; draw(); } },
      topics.map((tp) => el('option', { value: String(tp.topic_id), selected: tp.topic_id === id ? '' : null }, tp.topic_name)));
    const dueCount = selectToday(state)?.cards_due ?? 0;
    const reviewButton = dueCount ? el('button', { class: 'btn btn-primary cards-review', type: 'button', onclick: startReview },
      icon('cards', { size: 18 }), `Review ${dueCount} due card${dueCount > 1 ? 's' : ''}`) : null;
    const controls = el('div', { class: 'cards-controls' }, reviewButton,
      el('label', { class: 'field-label', for: 'cards-topic', text: t('cards.topic', language) }), select,
      el('button', { class: 'btn btn-secondary', type: 'button', disabled: busy || id == null ? '' : null, onclick: make },
        icon('cards', { size: 18 }), busy ? t('cards.making', language) : t('cards.make', language)));

    if (!topics.length) { replaceContent(root, el('p', { class: 'empty', text: t('cards.pick', language) })); return; }
    if (!cards.length) { replaceContent(root, controls, el('p', { class: 'hint', text: t('cards.empty', language) })); return; }

    const card = cards[index];
    const face = el('button', { class: `flashcard${flipped ? ' is-flipped' : ''}${card.source === 'mistake' ? ' is-mistake' : ''}`, type: 'button',
      'aria-label': `${flipped ? card.back : card.front}. ${flipped ? t('cards.flipBack', language) : t('cards.flip', language)}`,
      onclick: () => { flipped = !flipped; draw(true); } },
    card.source === 'mistake' ? el('span', { class: 'card-tag', text: t('cards.mistake', language) }) : null,
    el('span', { class: 'card-text', text: flipped ? card.back : card.front }),
    el('span', { class: 'card-hint', 'aria-hidden': 'true' }, icon('flip-horizontal', { size: 16 }), flipped ? t('cards.flipBack', language) : t('cards.flip', language)));
    const nav = el('div', { class: 'cards-nav' },
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': t('cards.prev', language), onclick: () => move(-1, cards.length) }, icon('arrow-left', { size: 20 })),
      el('span', { class: 'hint', 'aria-live': 'polite', text: t('cards.count', language, { n: index + 1, total: cards.length }) }),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': t('cards.next', language), onclick: () => move(1, cards.length) }, icon('arrow-right', { size: 20 })));
    const deckNode = el('div', { class: 'cards-deck', onkeydown: (event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1, cards.length); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1, cards.length); }
    } }, face, nav);
    replaceContent(root, controls, deckNode);
    if (keepFocus) root.querySelector('.flashcard')?.focus();
  }

  store.select(selectFlashcards, () => draw());
  store.select(selectToday, () => draw());
  globalThis.addEventListener?.('eklavya:review-cards', () => { startReview(); });   // the "cards to review" chip on Today
  store.select(selectSelectedTopicId, () => { chosen = null; index = 0; flipped = false; draw(); });
  store.select(selectDashboard, () => draw());
  store.select(selectLanguage, () => draw());
}
