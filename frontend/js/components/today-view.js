// The Today screen: a greeting, the streak, days to the exam, today's short plan with one big Start button,
// topics due for revision, and what happened last time.
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { SESSION_MODE } from '../lib/protocol.js';
import { t } from '../lib/strings.js';
import { selectLanguage, selectToday } from '../state/selectors.js';

const MODE_FOR_KIND = { revise: SESSION_MODE.REVISE, learn: SESSION_MODE.LEARN, test: SESSION_MODE.TEST };

function greetingKey(hour) {
  if (hour < 12) return 'today.morning';
  return hour < 17 ? 'today.afternoon' : 'today.evening';
}

export function mountTodayView({ store, root, onStart, onOpenTopic, onAddNotes, onReviewCards, now = () => new Date() }) {
  function planItem(item, language) {
    return el('li', { class: 'plan-item' },
      el('span', { class: `plan-kind kind-${item.kind}`, text: t(`kind.${item.kind}`, language) }),
      el('div', { class: 'plan-text' },
        el('button', { class: 'link-btn plan-topic', type: 'button', text: item.topic, onclick: () => onOpenTopic(item.topic_id) }),
        el('span', { class: 'plan-reason', text: item.reason })),
      el('span', { class: 'plan-min', text: `${item.minutes} min` }),
      el('button', { class: 'btn btn-secondary btn-sm', type: 'button', 'aria-label': `${t('today.start', language)}: ${item.topic}`,
        onclick: () => onStart(MODE_FOR_KIND[item.kind] ?? SESSION_MODE.LEARN, item.topic_id) },
      icon('play', { size: 16 }), t('today.start', language)));
  }

  function draw() {
    const state = store.getState();
    const today = selectToday(state);
    const language = selectLanguage(state);
    if (!today) { replaceContent(root, el('p', { class: 'empty', text: 'Loading your day…' })); return; }

    const first = today.plan[0];
    const head = el('div', { class: 'today-head' },
      el('h2', { class: 'today-greeting', text: t(greetingKey(now().getHours()), language) }),
      el('div', { class: 'today-chips' },
        el('span', { class: `chip-static${today.streak ? ' is-on' : ''}` }, icon('fire', { size: 18 }),
          today.streak ? t('today.streak', language, { n: today.streak }) : t('today.streakNone', language)),
        today.exam_days_left != null && today.exam_days_left >= 0
          ? el('span', { class: 'chip-static' }, icon('calendar-blank', { size: 18 }),
            today.exam_days_left === 0 ? t('today.examToday', language) : t('today.exam', language, { n: today.exam_days_left }))
          : null,
        today.cards_due
          ? el('button', { class: 'chip-static chip-action', type: 'button', onclick: onReviewCards }, icon('cards', { size: 18 }),
            `${today.cards_due} card${today.cards_due > 1 ? 's' : ''} to review`)
          : null));

    if (!today.has_notes) {
      replaceContent(root, head, el('div', { class: 'empty-state' },
        el('p', { text: t('today.noNotes', language) }),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: onAddNotes }, icon('upload-simple', { size: 18 }), t('today.addNotes', language))));
      return;
    }

    const plan = el('section', { class: 'today-plan', 'aria-labelledby': 'today-plan-title' },
      el('div', { class: 'today-plan-head' },
        el('h3', { id: 'today-plan-title', text: t('today.plan', language) }),
        today.plan_minutes ? el('span', { class: 'hint', text: t('today.planMinutes', language, { n: today.plan_minutes }) }) : null),
      today.plan.length
        ? el('ol', { class: 'plan-list' }, today.plan.map((item) => planItem(item, language)))
        : el('p', { class: 'hint', text: t('today.nothing', language) }),
      first ? el('button', { class: 'btn btn-primary btn-lg today-start', type: 'button',
        onclick: () => onStart(MODE_FOR_KIND[first.kind] ?? SESSION_MODE.LEARN, first.topic_id) },
      icon('microphone', { size: 20 }), t('today.startPlan', language)) : null);

    const due = today.due.length > (today.plan.filter((p) => p.kind === 'revise').length)
      ? el('section', { class: 'block', 'aria-labelledby': 'today-due-title' },
        el('h3', { id: 'today-due-title', text: t('today.due', language) }),
        el('ul', { class: 'list' }, today.due.map((d) => el('li', { class: 'due-row' },
          el('button', { class: 'link-btn', type: 'button', text: d.topic, onclick: () => onOpenTopic(d.topic_id) }),
          el('span', { class: 'hint', text: d.overdue_days ? t('today.overdue', language, { n: d.overdue_days }) : t('today.dueToday', language) }),
          el('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: () => onStart(SESSION_MODE.REVISE, d.topic_id) }, t('kind.revise', language))))))
      : null;

    const last = today.last_session
      ? el('p', { class: 'today-last' }, el('strong', { text: `${t('today.last', language)}: ` }),
        [today.last_session.mode_name, today.last_session.topic, t('today.turns', language, { n: today.last_session.turns }), today.last_session.date]
          .filter(Boolean).join(' · '))
      : null;

    replaceContent(root, head, plan, due, last);
  }

  store.select(selectToday, draw);
  store.select(selectLanguage, draw);
}
