// The four numbers at the top of Progress: average mastery, answers right, misconceptions fixed, study streak.
import { el, render } from '../lib/dom.js';
import { t } from '../lib/strings.js';
import { selectDashboard, selectLanguage, selectToday } from '../state/selectors.js';

export function mountStatTiles({ store, root }) {
  function draw() {
    const state = store.getState();
    const language = selectLanguage(state);
    const dashboard = selectDashboard(state);
    const mastery = dashboard?.mastery ?? [];
    const history = dashboard?.quiz_history ?? [];
    const right = history.filter((a) => a.is_correct).length;
    const fixed = dashboard?.misconceptions_resolved ?? 0;
    const open = (dashboard?.alerts ?? []).filter((a) => a.type === 'misconception' || a.kind === 'misconception').length;
    const streak = selectToday(state)?.streak ?? 0;
    const average = mastery.length ? Math.round(mastery.reduce((sum, m) => sum + m.mastery_score, 0) / mastery.length) : null;

    const tile = (label, value, note, tone) => el('div', { class: 'stat-tile' },
      el('span', { class: 'stat-label', text: label }),
      el('strong', { class: `stat-value${tone ? ` is-${tone}` : ''}`, text: value }),
      el('span', { class: 'stat-note', text: note }));
    render(root,
      tile(t('stat.mastery', language), average == null ? '—' : `${average}%`, t('stat.masteryNote', language, { n: mastery.length })),
      tile(t('stat.answers', language), history.length ? `${right} of ${history.length}` : '—', t('stat.answersNote', language)),
      tile(t('stat.fixed', language), String(fixed), open ? t('stat.fixedOpen', language, { n: open }) : t('stat.fixedNone', language), fixed ? 'ok' : null),
      tile(t('stat.streak', language), streak ? t('stat.days', language, { n: streak }) : '—', t('stat.streakNote', language)));
  }
  store.select(selectDashboard, draw);
  store.select(selectToday, draw);
  store.select(selectLanguage, draw);
}
