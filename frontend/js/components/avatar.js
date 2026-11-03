// Eklavya's face: a drawn character whose mouth follows the voice and whose expression follows the moment.
// Drawn in SVG, no video and no vendor. Two looks, one per tutor choice ("mentor" with glasses, "senior" with a cap).
// All motion is CSS, driven by data attributes and the --level variable (0-1 loudness), so this file only sets those.
import { svgEl, el } from '../lib/dom.js';
import { avatarLook } from '../lib/avatar-mood.js';
import { selectEmotion, selectResult, selectVoiceStatus } from '../state/selectors.js';

function face() {
  const s = (tag, attrs, ...kids) => svgEl(tag, attrs, ...kids);
  return s('svg', { viewBox: '0 0 120 130', class: 'avatar-svg', role: 'img', 'aria-label': 'Eklavya, your tutor' },
    s('path', { class: 'av-shoulders', d: 'M12 130c2-24 22-34 48-34s46 10 48 34z' }),
    s('rect', { class: 'av-neck', x: '50', y: '84', width: '20', height: '18', rx: '8' }),
    s('circle', { class: 'av-head', cx: '60', cy: '56', r: '34' }),
    s('path', { class: 'av-hair av-hair-mentor', d: 'M26 54c-2-26 14-38 34-38s36 12 34 38c-6-14-16-20-34-20S32 40 26 54z' }),
    s('path', { class: 'av-hair av-hair-senior', d: 'M25 52c-1-22 14-36 35-36s36 14 35 36c-3-10-10-14-18-14-6 0-10-6-17-6s-12 6-18 6c-8 0-14 4-17 14z' }),
    s('path', { class: 'av-cap', d: 'M24 44c4-20 20-30 36-30s32 10 36 30c-8-6-22-8-36-8s-28 2-36 8zM60 36h38c4 0 6 3 2 5-6 3-24 3-40 1z' }),
    s('g', { class: 'av-eyes' },
      s('ellipse', { class: 'av-eye', cx: '47', cy: '58', rx: '4', ry: '5' }),
      s('ellipse', { class: 'av-eye', cx: '73', cy: '58', rx: '4', ry: '5' })),
    s('g', { class: 'av-brows' },
      s('path', { class: 'av-brow av-brow-l', d: 'M40 47q7-4 14 0' }),
      s('path', { class: 'av-brow av-brow-r', d: 'M66 47q7-4 14 0' })),
    s('g', { class: 'av-glasses' },
      s('circle', { cx: '47', cy: '58', r: '10' }), s('circle', { cx: '73', cy: '58', r: '10' }), s('path', { d: 'M57 58h6' })),
    s('ellipse', { class: 'av-cheek', cx: '38', cy: '70', rx: '6', ry: '4' }),
    s('ellipse', { class: 'av-cheek', cx: '82', cy: '70', rx: '6', ry: '4' }),
    s('path', { class: 'av-mouth av-smile', d: 'M48 75q12 10 24 0' }),
    s('path', { class: 'av-mouth av-flat', d: 'M50 78q10 3 20 0' }),
    s('path', { class: 'av-mouth av-hmm', d: 'M50 79h20' }),
    s('ellipse', { class: 'av-mouth-open', cx: '60', cy: '77', rx: '9', ry: '7' }));
}

/** @returns {{setLevel: (level: number) => void, setTutor: (tutor: string) => void}} */
export function mountAvatar({ store, root, getTutor = () => 'mentor' }) {
  const wrap = el('div', { class: 'avatar', 'data-state': 'idle', 'data-mood': 'calm', 'data-tutor': getTutor() }, face());
  root.append(wrap);
  const mentor = { set() {}, setLevel() {} };   // one mentor only: the drawn face (the 3D bust that used to sit over it is off)

  function draw() {
    const state = store.getState();
    const { mood, state: voice } = avatarLook({ status: selectVoiceStatus(state), emotion: selectEmotion(state), result: selectResult(state) });
    wrap.dataset.state = voice;
    wrap.dataset.mood = mood;
    wrap.dataset.tutor = getTutor();
    if (voice === 'idle') wrap.style.setProperty('--level', '0');
    mentor.set({ state: voice, mood, tutor: getTutor() });
  }
  store.select(selectVoiceStatus, draw);
  store.select(selectEmotion, draw);
  store.select(selectResult, draw);

  let shown = 0;
  return {
    setLevel(level) {
      shown = shown * 0.6 + Math.max(0, Math.min(1, level)) * 0.4;
      wrap.style.setProperty('--level', shown.toFixed(3));
      mentor.setLevel(level);
    },
    setTutor(tutor) { wrap.dataset.tutor = tutor === 'senior' ? 'senior' : 'mentor'; mentor.set({ tutor: wrap.dataset.tutor }); },
  };
}
