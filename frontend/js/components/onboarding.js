// First-run guide, in 3 steps: tutor language, add notes, how talking works (with the mic permission explained
// before the browser asks). A modal <dialog>: focus stays inside, Escape closes, and it is shown only once.
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { LANGUAGES } from '../lib/protocol.js';
import { t } from '../lib/strings.js';
import { selectDashboard, selectLanguage, selectOnboarding } from '../state/selectors.js';

const DONE_KEY = 'eklavya.onboarded';
const LANGUAGE_CHOICES = [[LANGUAGES.HINGLISH, 'Hinglish', 'Mix of Hindi and English'], [LANGUAGES.ENGLISH, 'English', 'Simple English'],
  [LANGUAGES.HINDI, 'हिन्दी', 'शुद्ध हिन्दी']];

/** Whether the guide was finished or skipped before (per browser). Never throws: storage can be blocked. */
export function onboardingDone() {
  try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; }
}

export function mountOnboarding({ store, dialog, onLanguage, onUpload, onDemo, onHello, onClose }) {
  let step = 1;
  let demoBusy = false;   // the demo notes are loading: the button says so and cannot be clicked again

  function finish(next) {
    try { localStorage.setItem(DONE_KEY, '1'); } catch { /* private window: show it again next time */ }
    onClose();
    next?.();
  }

  function stepLanguage(language) {
    return [
      el('h2', { id: 'onb-title', text: t('onb.langTitle', language) }),
      el('p', { class: 'hint', text: t('onb.langBody', language) }),
      el('div', { class: 'onb-choices', role: 'group', 'aria-labelledby': 'onb-title' }, LANGUAGE_CHOICES.map(([value, name, note]) =>
        el('button', { class: 'onb-choice', type: 'button', 'aria-pressed': String(language === value), lang: value === 'hindi' ? 'hi' : null,
          onclick: () => onLanguage(value) }, el('strong', { text: name }), el('span', { text: note })))),
    ];
  }

  function stepNotes(language, hasNotes) {
    return [
      el('h2', { id: 'onb-title', text: t('onb.notesTitle', language) }),
      el('p', { class: 'hint', text: hasNotes ? t('onb.haveNotes', language) : t('onb.notesBody', language) }),
      hasNotes ? null : el('div', { class: 'onb-actions-row' },
        el('button', { class: 'btn btn-primary', type: 'button', onclick: onUpload }, icon('upload-simple', { size: 18 }), t('notes.upload', language)),
        el('button', { class: 'btn btn-secondary', type: 'button', disabled: demoBusy ? '' : null, 'aria-busy': String(demoBusy),
          onclick: async () => { demoBusy = true; draw(); try { await onDemo(); } finally { demoBusy = false; draw(); } } },
        demoBusy ? t('notes.loading', language) : t('notes.demo', language))),
    ];
  }

  function stepMic(language) {
    return [
      el('div', { class: 'onb-mic', 'aria-hidden': 'true' }, icon('microphone', { size: 36 })),
      el('h2', { id: 'onb-title', text: t('onb.micTitle', language) }),
      el('p', { class: 'hint', text: t('onb.micBody', language) }),
    ];
  }

  function draw() {
    const state = store.getState();
    const open = selectOnboarding(state);
    if (!open) { if (dialog.open) dialog.close(); return; }
    const language = selectLanguage(state);
    const hasNotes = Boolean(selectDashboard(state)?.mastery?.length);
    const body = step === 1 ? stepLanguage(language) : step === 2 ? stepNotes(language, hasNotes) : stepMic(language);
    const footer = el('div', { class: 'onb-footer' },
      step > 1 ? el('button', { class: 'btn btn-quiet', type: 'button', onclick: () => { step -= 1; draw(); } }, t('onb.back', language))
        : el('button', { class: 'btn btn-quiet', type: 'button', onclick: () => finish() }, t('onb.skip', language)),
      step < 3
        ? el('button', { class: 'btn btn-primary', type: 'button', onclick: () => { step += 1; draw(); } }, t('onb.next', language), icon('arrow-right', { size: 18 }))
        : el('div', { class: 'onb-actions-row' },
          el('button', { class: 'btn btn-quiet', type: 'button', onclick: () => finish() }, t('onb.later', language)),
          el('button', { class: 'btn btn-primary', type: 'button', disabled: hasNotes ? null : '', onclick: () => finish(onHello) },
            icon('microphone', { size: 18 }), t('onb.hello', language))));
    replaceContent(dialog,
      el('p', { class: 'onb-step', text: t('onb.step', language, { n: step }) }),
      el('div', { class: 'onb-body' }, body),
      footer);
    if (!dialog.open) dialog.showModal();
    // keep focus where the student is: the chosen language on step 1, otherwise the first action of the step
    (dialog.querySelector('.onb-choice[aria-pressed="true"]') ?? dialog.querySelector('.onb-body button, .onb-footer .btn-primary'))?.focus();
  }

  dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(); });   // Escape
  store.select(selectOnboarding, draw);
  store.select(selectLanguage, draw);
  store.select(selectDashboard, () => { if (step === 2) draw(); });
}
