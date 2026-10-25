// How the tutor heard the student this turn (confusion / confidence / frustration).
import { el, render as replaceContent } from '../lib/dom.js';
import { selectEmotion } from '../state/selectors.js';

const METERS = [['confusion', 'Confused'], ['confidence', 'Confident'], ['frustration', 'Frustrated']];

export function mountEmotionCard({ store, root }) {
  store.select(selectEmotion, (emotion) => {
    root.hidden = !emotion;
    if (!emotion) { replaceContent(root); return; }
    replaceContent(root,
      el('div', { class: 'emotion-head' },
        el('h3', { class: 'emotion-title', text: 'How you sound' }),
        emotion.topic ? el('span', { class: 'pill', text: emotion.topic }) : null),
      ...METERS.map(([key, label]) => {
        const percent = Math.round((emotion[key] ?? 0) * 100);
        return el('div', { class: 'meter-row' },
          el('span', { text: label }),
          el('span', { class: 'meter', role: 'img', 'aria-label': `${label} ${percent}%` }, el('span', { style: `width:${percent}%` })),
          el('span', { class: 'meter-val', text: `${percent}%` }));
      }),
      emotion.note ? el('p', { class: 'emotion-note', text: emotion.note }) : null);
  });
}
