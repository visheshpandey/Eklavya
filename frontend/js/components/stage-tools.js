// Tools next to the voice button: big live captions, and "Show a photo" (snap a doubt during a call).
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/strings.js';
import { selectCaptions, selectLanguage, selectMessages, selectSessionActive } from '../state/selectors.js';

export function mountStageTools({ store, root, captionRoot, onToggleCaptions, onPhoto }) {
  const file = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true,
    onchange: async () => { const chosen = file.files[0]; file.value = ''; if (chosen) await onPhoto(chosen); } });
  const captionsButton = el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: onToggleCaptions });
  const photoButton = el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => file.click() });
  root.append(captionsButton, photoButton, file);

  function drawButtons() {
    const state = store.getState();
    const language = selectLanguage(state);
    replaceContent(captionsButton, icon('closed-captioning', { size: 18 }), t('stage.captions', language));
    captionsButton.setAttribute('aria-pressed', String(selectCaptions(state)));
    replaceContent(photoButton, icon('camera', { size: 18 }), t('stage.photo', language));
    photoButton.disabled = !selectSessionActive(state);
  }

  /** Captions: the last thing Eklavya said (or is saying), in large type. The transcript below stays the record. */
  function drawCaption() {
    const state = store.getState();
    const on = selectCaptions(state);
    const last = [...selectMessages(state)].reverse().find((m) => m.role === 'tutor');
    captionRoot.hidden = !on || !last;
    if (!captionRoot.hidden) captionRoot.textContent = last.text;
  }

  store.select(selectCaptions, () => { drawButtons(); drawCaption(); });
  store.select(selectLanguage, drawButtons);
  store.select(selectSessionActive, drawButtons);
  store.select(selectMessages, drawCaption);
}
