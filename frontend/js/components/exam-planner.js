// Exam planner: pick the exam date and daily minutes; see the next 7 days (and the whole plan on request).
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/strings.js';
import { selectLanguage, selectPlan } from '../state/selectors.js';

const MINUTE_CHOICES = [15, 30, 45, 60, 90];
const PREVIEW_DAYS = 7;

const isoDay = (date) => date.toISOString().slice(0, 10);

function dayLabel(iso, language) {
  const date = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat(language === 'hindi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

export function mountExamPlanner({ store, root, onSave, onClear, onStartItem }) {
  let showAll = false;
  let draft = null;   // {date, minutes} typed but not saved: kept across redraws

  function dayRow(day, language) {
    return el('li', { class: 'plan-day' },
      el('span', { class: 'plan-date', text: dayLabel(day.date, language) }),
      day.items.length
        ? el('span', { class: 'plan-day-items' }, day.items.map((item) => el('button', {
          class: `chip kind-${item.kind}`, type: 'button', title: `${t(`kind.${item.kind}`, language)} · ${item.minutes} min`,
          onclick: () => onStartItem(item) }, `${item.topic} · ${t(`kind.${item.kind}`, language)}`)))
        : el('span', { class: 'hint', text: t('planner.rest', language) }));
  }

  function draw() {
    const state = store.getState();
    const plan = selectPlan(state);
    const language = selectLanguage(state);
    const tomorrow = new Date(Date.now() + 86_400_000);
    const date = el('input', { class: 'field', type: 'date', id: 'exam-date', min: isoDay(tomorrow),
      value: draft?.date ?? plan?.exam_date ?? '', oninput: () => { draft = { ...draft, date: date.value }; } });
    const minutes = el('select', { class: 'select', id: 'exam-minutes', onchange: () => { draft = { ...draft, minutes: Number(minutes.value) }; } },
      MINUTE_CHOICES.map((m) => el('option', { value: String(m), selected: m === (draft?.minutes ?? plan?.minutes_per_day ?? 30) ? '' : null }, `${m} min`)));

    const form = el('form', { class: 'planner-form', onsubmit: (event) => {
      event.preventDefault();
      if (!date.value) { date.focus(); return; }
      draft = null;
      onSave(date.value, Number(minutes.value));
    } },
    el('label', { class: 'field-label', for: 'exam-date', text: t('planner.date', language) }), date,
    el('label', { class: 'field-label', for: 'exam-minutes', text: t('planner.minutes', language) }), minutes,
    el('div', { class: 'planner-actions' },
      el('button', { class: 'btn btn-primary', type: 'submit' }, icon('calendar-blank', { size: 18 }), t('planner.save', language)),
      plan?.exam_date ? el('button', { class: 'btn btn-quiet', type: 'button', onclick: () => { draft = null; onClear(); } }, t('planner.clear', language)) : null));

    const days = plan?.plan?.days ?? [];
    const shown = showAll ? days : days.slice(0, PREVIEW_DAYS);
    replaceContent(root,
      el('h3', { class: 'block-title' }, icon('calendar-blank', { size: 20 }), t('planner.title', language)),
      form,
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
