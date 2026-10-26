// Flashcards: pick a topic, have Eklavya write cards from the notes (plus one per past mistake), then flip through.
// Keyboard: the card is a button (Enter/Space flips); Left/Right arrows move between cards.
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/strings.js';
import { selectDashboard, selectFlashcards, selectLanguage, selectSelectedTopicId } from '../state/selectors.js';

export function mountFlashcards({ store, root, onLoad, onMake }) {
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

  function draw(keepFocus = false) {
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
    const controls = el('div', { class: 'cards-controls' },
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
  store.select(selectSelectedTopicId, () => { chosen = null; index = 0; flipped = false; draw(); });
  store.select(selectDashboard, () => draw());
  store.select(selectLanguage, () => draw());
}
