// Your decks: pick a topic, have Eklavya write cards from the notes (plus one per past mistake), and browse them. The review session itself
// (due cards, ratings, the Leitner schedule) is flashcard-review.js, the one place cards are reviewed.
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/strings.js';
import { selectDashboard, selectFlashcards, selectLanguage, selectSelectedTopicId, selectToday } from '../state/selectors.js';

export function mountFlashcards({ store, root, onLoad, onMake }) {
  let busy = false;
  let chosen = null;   // topic picked in this card's own selector
  let requested = null; // topic whose cards were asked for (one request per topic, even if it fails)

  const topicId = () => chosen ?? selectSelectedTopicId(store.getState()) ?? selectDashboard(store.getState())?.weak_topics?.[0]?.topic_id ?? null;

  async function make() {
    const id = topicId();
    if (id == null) return;
    busy = true; draw();
    await onMake(id);
    busy = false; draw();
  }

  function draw(keepFocus = false) {
    const state = store.getState();
    const language = selectLanguage(state);
    const topics = selectDashboard(state)?.mastery ?? [];
    const deck = selectFlashcards(state);
    const id = topicId();
    if (id != null && deck.topicId !== id && requested !== id) { requested = id; onLoad(id); }
    const cards = deck.topicId === id ? deck.cards : [];

    const select = el('select', { class: 'select', id: 'cards-topic', onchange: () => { chosen = Number(select.value); draw(); } },
      topics.map((tp) => el('option', { value: String(tp.topic_id), selected: tp.topic_id === id ? '' : null }, tp.topic_name)));
    const controls = el('div', { class: 'cards-controls' },
      el('label', { class: 'field-label', for: 'cards-topic', text: t('cards.topic', language) }), select,
      el('button', { class: 'btn btn-secondary', type: 'button', disabled: busy || id == null ? '' : null, onclick: make },
        icon('cards', { size: 18 }), busy ? t('cards.making', language) : t('cards.make', language)));

    if (!topics.length) { replaceContent(root, el('p', { class: 'empty', text: t('cards.pick', language) })); return; }
    if (!cards.length) { replaceContent(root, controls, el('p', { class: 'hint', text: t('cards.empty', language) })); return; }

    // no second review here: the cards of this topic are only counted, reviewing happens in the one session above
    const mistakes = cards.filter((card) => card.source === 'mistake').length;
    replaceContent(root, controls, el('p', { class: 'hint', role: 'status', text: `${cards.length} card${cards.length === 1 ? '' : 's'} in this topic${mistakes ? `, ${mistakes} from past mistakes` : ''}. They come up in your review session.` }));
  }

  store.select(selectFlashcards, () => draw());
  store.select(selectToday, () => draw());
  store.select(selectSelectedTopicId, () => { chosen = null; draw(); });
  store.select(selectDashboard, () => draw());
  store.select(selectLanguage, () => draw());
}
