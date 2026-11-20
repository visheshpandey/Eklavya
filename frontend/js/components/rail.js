// The left rail's live parts: the streak card with the last seven days, the number of cards due next to Flashcards, and the page name in
// the top bar. The account chip (name and avatar) is set once from the login in main.js.
import { dueCount } from '../lib/cards.js';
import { selectLanguage, selectToday, selectView } from '../state/selectors.js';
import { t } from '../lib/strings.js';
import { plainCount } from '../lib/progress-text.js';

const VIEW_KEYS = { today: 'tab.today', library: 'tab.notes', study: 'tab.study', ask: 'tab.ask', progress: 'tab.progress', flashcards: 'tab.flashcards', groups: 'tab.groups' };

/** The sentence under the streak number. */
export function streakNote(days, language = 'english') {
  if (!days) return t('streak.none', language);
  if (days === 1) return t('streak.first', language);
  return t('streak.many', language, { n: days });
}

export function mountRail({ store, streakDays, streakUnit, streakText, weekDots, dueBadge, crumb }) {
  store.select(selectToday, (today) => {
    const days = today?.streak ?? 0;
    streakDays.textContent = plainCount(days);
    const language = selectLanguage(store.getState());
    streakUnit.textContent = t(days === 1 ? 'streak.day' : 'streak.days', language);
    streakText.textContent = streakNote(days, language);
    const week = today?.week ?? Array(7).fill(false);
    [...weekDots.children].forEach((dot, index) => dot.classList.toggle('on', Boolean(week[index])));
    weekDots.setAttribute('aria-label', `Active ${week.filter(Boolean).length} of the last 7 days`);
    const chip = document.getElementById('streakChipN');   // the phone's version of the streak card: a chip in the top bar and a sheet
    if (chip) {
      chip.textContent = String(days);
      document.getElementById('btnStreak').setAttribute('aria-label', `Learning streak: ${days} day${days === 1 ? '' : 's'}`);
      document.getElementById('btnStreak').classList.toggle('is-on', days > 0);
      document.getElementById('streakSheetDays').textContent = String(days);
      document.getElementById('streakSheetUnit').textContent = days === 1 ? 'day' : 'days';
      document.getElementById('streakSheetNote').textContent = streakNote(days, language);
      [...document.getElementById('streakSheetWeek').children].forEach((dot, index) => dot.classList.toggle('on', Boolean(week[index])));
    }
    const due = dueCount(store.getState());
    dueBadge.textContent = String(due);
    dueBadge.hidden = !due;
  });
  const drawCrumb = () => { const state = store.getState(); crumb.textContent = t(VIEW_KEYS[state.ui.view] ?? 'tab.today', selectLanguage(state)); };
  store.select(selectView, drawCrumb);
  store.select(selectLanguage, drawCrumb);
}
