// The numbers at the top of Progress: overall mastery, questions answered, cards known today, open misconceptions, misconceptions fixed
// and the study streak. All from the real dashboard and Today data.
import { el, render } from '../lib/dom.js';
import { t } from '../lib/strings.js';
import { MASTERY_HELP, plainCount } from '../lib/progress-text.js';
import { groupSubjects } from '../lib/subjects.js';
import { selectDashboard, selectLanguage, selectToday } from '../state/selectors.js';

export function mountStatTiles({ store, root }) {
  function draw() {
    const state = store.getState();
    const language = selectLanguage(state);
    const dashboard = selectDashboard(state);
    const today = selectToday(state);
    const mastery = dashboard?.mastery ?? [];
    const attempts = dashboard?.progress ?? [];
    const right = attempts.filter((a) => a.is_correct).length;
    const open = (dashboard?.alerts ?? []).filter((a) => a.type === 'misconception').length;
    const fixed = dashboard?.misconceptions_resolved ?? 0;
    const streak = today?.streak ?? 0;
    const begun = mastery.filter((m) => m.started !== false);
    const average = begun.length ? Math.round(begun.reduce((sum, m) => sum + m.mastery_score, 0) / begun.length) : null;
    const subjects = groupSubjects(mastery).length;
    const cardsTotal = today?.cards_total ?? 0;
    const cardsKnown = Math.max(0, cardsTotal - (today?.cards_due ?? 0));

    const tile = (label, value, note, tone, help = null) => el('div', { class: 'stat', title: help },
      el('span', { class: 'mono', text: label }),
      el('strong', { class: 'tnum', style: tone ? `color:var(--${tone})` : null, text: value }),
      el('p', { text: note }));
    render(root,
      tile(t('stat.mastery', language), average === null ? 'New' : `${average}%`, !mastery.length ? 'Add notes to begin' : average === null ? 'Answer a question or rate a card to start' : `${begun.length} of ${mastery.length} topics started, ${subjects} subject${subjects === 1 ? '' : 's'}`, null, MASTERY_HELP),
      tile(t('stat.answers', language), String(attempts.length), attempts.length ? `${right} correct · ${attempts.length - right} to revisit` : 'Answer a question to see this'),
      tile('Cards known today', `${cardsKnown} / ${cardsTotal}`, cardsTotal ? 'From your flashcard decks' : 'Make cards in the Flashcards tab'),
      tile('Open misconceptions', plainCount(open), open ? 'Worth clearing up next' : 'None open right now', open ? 'accent-text' : null),
      tile(t('stat.fixed', language), String(fixed), fixed ? 'Cleared by getting it right' : 'None cleared yet', fixed ? 'ok-text' : null),
      tile(t('stat.streak', language), t(streak === 1 ? 'stat.day' : 'stat.days', language, { n: streak }), streak ? t('stat.streakNote', language) : 'Study today to start one'));
  }
  store.select(selectDashboard, draw);
  store.select(selectToday, draw);
  store.select(selectLanguage, draw);
}
