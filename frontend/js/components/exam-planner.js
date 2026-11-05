// Exam planner: pick the exam date and daily minutes; see the next 7 days (and the whole plan on request).
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { shortDate } from '../lib/format.js';
import { t } from '../lib/strings.js';
import { groupBySubject } from '../lib/subjects.js';
import { selectLanguage, selectPlan } from '../state/selectors.js';

const MINUTE_CHOICES = [15, 30, 45, 60, 90];
const PREVIEW_DAYS = 7;

const AGENT_LINE = {
  english: 'Eklavya plans from your weakest and fading topics, and re-plans by itself if you miss a day.',
  hindi: 'एकलव्य आपके कमज़ोर और भूलते विषयों से योजना बनाता है, और कोई दिन छूटे तो खुद नई योजना बना देता है।',
};

/** What the planner agent says about a re-plan: the sentence, or null when nothing was missed (pure, so it can be tested). */
export function replanNote(plan) {
  const text = plan?.replan?.message;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

/** The one-line explanation shown under the title once there is a plan. */
export const agentLine = (language) => AGENT_LINE[language] ?? AGENT_LINE.english;

const isoDay = (date) => date.toISOString().slice(0, 10);
const MAX_DAYS_AHEAD = 1100;   // the server's limit too (about three years): a six-digit year typed into a date field is a typo

function dayLabel(iso, language) {
  const date = new Date(`${iso}T12:00:00`);
  const weekday = new Intl.DateTimeFormat(language === 'hindi' ? 'hi-IN' : 'en-GB', { weekday: 'short' }).format(date);
  return `${weekday}, ${shortDate(iso)}`;   // "Mon, 2 Nov"
}

export function mountExamPlanner({ store, root, onSave, onClear, onOpenItem }) {
  let showAll = false;
  let draft = null;   // {date, minutes} typed but not saved: kept across redraws

  function dayRow(day, language) {
    return el('li', { class: 'plan-day' },
      el('span', { class: 'plan-date', text: dayLabel(day.date, language) }),
      day.items.length
        // the subject is said once ("Software"), then its topics: no "Software:" repeated on every chip
        ? el('span', { class: 'plan-day-items' }, groupBySubject(day.items).map((group) => el('span', { class: 'plan-group' },
          group.subject ? el('span', { class: 'plan-subject mono', text: group.subject }) : null,
          group.items.map((item) => el('button', {
            class: `chip kind-${item.kind}`, type: 'button', title: `${item.topic} · ${t(`kind.${item.kind}`, language)} · ${item.minutes} min`,
            onclick: () => onOpenItem(item) }, `${item.shortTopic} · ${t(`kind.${item.kind}`, language)}`)))))
        : el('span', { class: 'hint', text: t('planner.rest', language) }));
  }

  function draw() {
    const state = store.getState();
    const plan = selectPlan(state);
    const language = selectLanguage(state);
    const tomorrow = new Date(Date.now() + 86_400_000);
    const date = el('input', { class: 'field', type: 'date', id: 'exam-date', min: isoDay(tomorrow), max: isoDay(new Date(Date.now() + MAX_DAYS_AHEAD * 86_400_000)),
      value: draft?.date ?? plan?.exam_date ?? '', oninput: () => { draft = { ...draft, date: date.value }; } });
    const minutes = el('select', { class: 'select', id: 'exam-minutes', onchange: () => { draft = { ...draft, minutes: Number(minutes.value) }; } },
      MINUTE_CHOICES.map((m) => el('option', { value: String(m), selected: m === (draft?.minutes ?? plan?.minutes_per_day ?? 30) ? '' : null }, `${m} min`)));

    const form = el('form', { class: 'planner-form', onsubmit: (event) => {
      event.preventDefault();
      if (!date.value) { date.focus(); return; }
      draft = null;
      const button = form.querySelector('button[type="submit"]');   // the plan is built on the server: say so while it works
      const label = [...button.childNodes];
      button.disabled = true; button.textContent = 'Planning…';
      Promise.resolve(onSave(date.value, Number(minutes.value))).finally(() => { button.disabled = false; button.replaceChildren(...label); });
    } },
    el('label', { class: 'field-label', for: 'exam-date', text: t('planner.date', language) }), date,
    el('label', { class: 'field-label', for: 'exam-minutes', text: t('planner.minutes', language) }), minutes,
    el('div', { class: 'planner-actions' },
      el('button', { class: 'btn btn-primary', type: 'submit' }, icon('calendar-blank', { size: 18 }), t('planner.save', language)),
      plan?.exam_date ? el('button', { class: 'btn btn-quiet', type: 'button', onclick: () => { draft = null; onClear(); } }, t('planner.clear', language)) : null));

    const days = plan?.plan?.days ?? [];
    const shown = showAll ? days : days.slice(0, PREVIEW_DAYS);
    const note = replanNote(plan);
    replaceContent(root,
      el('h3', { class: 'block-title' }, icon('calendar-blank', { size: 20 }), t('planner.title', language)),
      form,
      note ? el('p', { class: 'replan-note', role: 'status' }, el('span', { class: 'mono', text: 'Plan updated' }), note) : null,
      days.length ? el('p', { class: 'hint planner-agent', text: agentLine(language) }) : null,
      days.length
        ? [el('h4', { class: 'sub-title', text: showAll ? t('planner.title', language) : t('planner.next', language) }),
          el('ol', { class: 'plan-days' }, shown.map((day) => dayRow(day, language))),
          days.length > PREVIEW_DAYS && !showAll
            ? el('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: () => { showAll = true; draw(); } }, t('planner.all', language))
            : null]
        : el('p', { class: 'hint', text: t('planner.empty', language) }));
  }

  store.select(selectPlan, draw);
  store.select(selectLanguage, draw);
}
