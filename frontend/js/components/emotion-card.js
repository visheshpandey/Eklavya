// How the tutor heard the student this turn (confusion / confidence / frustration meters).
import { el, render } from '../lib/dom.js';
import { selectEmotion } from '../state/selectors.js';

const METERS = [['confusion', 'Confused'], ['confidence', 'Confident'], ['frustration', 'Frustrated']];

export function mountEmotionCard({ store, root }) {
  store.select(selectEmotion, (emotion) => {
    root.hidden = !emotion;
    if (!emotion) { root.replaceChildren(); return; }
    render(root,
      el('div', { class: 'emo-head' },
        el('span', { class: 'emo-title', text: 'How you sound' }),
        emotion.topic ? el('span', { class: 'pill', text: emotion.topic }) : null),
      ...METERS.map(([key, label]) => {
        const percent = Math.round((emotion[key] ?? 0) * 100);
        return el('div', { class: `meter ${key}` },
          el('span', { class: 'meter-label', text: label }),
          el('span', { class: 'meter-track' }, el('span', { class: 'meter-fill', style: `width:${percent}%` })),
          el('span', { class: 'meter-val', text: `${percent}%` }));
      }),
      emotion.note ? el('p', { class: 'emo-note', text: emotion.note }) : null,
    );
  });
}
