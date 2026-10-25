// Emotion meters: how the tutor heard the student this turn (from the report_learner_state tool).
import { el, $ } from './dom.js';

const METERS = [['confusion', 'Confused'], ['confidence', 'Confident'], ['frustration', 'Frustrated']];

export function showEmotion(ev) {
  const box = $('emotion');
  box.replaceChildren(
    el('div', { class: 'emo-head' },
      el('span', { class: 'emo-title', text: 'How you sound' }),
      ev.topic ? el('span', { class: 'pill', text: ev.topic }) : null),
    ...METERS.map(([k, label]) => {
      const v = Math.round((ev[k] ?? 0) * 100);
      return el('div', { class: 'meter ' + k },
        el('span', { class: 'meter-label', text: label }),
        el('span', { class: 'meter-track' }, el('span', { class: 'meter-fill', style: 'width:' + v + '%' })),
        el('span', { class: 'meter-val', text: v + '%' }));
    }),
    ev.note ? el('p', { class: 'emo-note', text: ev.note }) : null,
  );
  box.hidden = false;
}
