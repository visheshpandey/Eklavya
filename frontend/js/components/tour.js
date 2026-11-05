// A short guided tour (custom coach marks, no library): a spotlight on one part of one screen and a card saying what it is. Skippable (Skip, Escape),
// Back and Next (buttons or arrow keys), and it can be replayed from the help menu. `steps` are {view, target, fallback, title, text}.
import { el } from '../lib/dom.js';

export function createTour({ steps, showView, onEnd = () => {} }) {
  let index = -1, spot = null, card = null, layer = null;

  const target = (step) => document.querySelector(step.target) ?? (step.fallback ? document.querySelector(step.fallback) : null);

  function place() {
    if (index < 0) return;
    const step = steps[index], node = target(step);
    const box = node?.getBoundingClientRect();
    if (!box || !box.width) { Object.assign(spot.style, { left: '50%', top: '40%', width: '0px', height: '0px' }); card.style.top = '30%'; card.style.left = '50%'; card.style.transform = 'translateX(-50%)'; return; }
    const pad = 10;
    Object.assign(spot.style, { left: `${box.left - pad}px`, top: `${box.top - pad}px`, width: `${box.width + 2 * pad}px`, height: `${box.height + 2 * pad}px` });
    const below = box.bottom + 16 + 190 < innerHeight;
    card.style.transform = 'none';
    card.style.top = `${below ? box.bottom + 16 : Math.max(12, box.top - 16 - card.offsetHeight)}px`;
    card.style.left = `${Math.min(Math.max(12, box.left), innerWidth - card.offsetWidth - 12)}px`;
  }

  async function show(next) {
    index = next;
    const step = steps[index];
    showView(step.view);
    await new Promise((resolve) => setTimeout(resolve, 520));   // the tab change finishes first
    target(step)?.scrollIntoView({ block: 'center', behavior: 'auto' });
    await new Promise((resolve) => setTimeout(resolve, 150));
    card.replaceChildren(
      el('span', { class: 'mono', text: `Step ${index + 1} of ${steps.length}` }),
      el('h3', { class: 'serif-sm', text: step.title }), el('p', { text: step.text }),
      el('div', { class: 'tour-acts' },
        el('button', { class: 'linkbtn', type: 'button', onclick: stop }, 'Skip'),
        index > 0 ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => show(index - 1) }, 'Back') : null,
        el('button', { class: 'btn btn-primary btn-sm', type: 'button', id: 'tourNext', onclick: () => (index + 1 < steps.length ? show(index + 1) : stop(true)) },
          index + 1 < steps.length ? 'Next →' : 'Done')));
    card.hidden = false;
    place();
    card.querySelector('#tourNext')?.focus({ preventScroll: true });
  }

  const onKey = (event) => {
    if (event.key === 'Escape') stop();
    else if (event.key === 'ArrowRight' && index + 1 < steps.length) show(index + 1);
    else if (event.key === 'ArrowLeft' && index > 0) show(index - 1);
  };

  function start() {
    if (index >= 0) return;
    spot = el('div', { class: 'tour-spot' });
    card = el('div', { class: 'tour-card', role: 'dialog', 'aria-label': 'Guided tour', 'aria-live': 'polite', hidden: '' });   // shown once its first step is written, so no empty box flashes
    layer = el('div', { class: 'tour-layer' }, spot, card);
    document.body.append(layer);
    document.addEventListener('keydown', onKey);
    addEventListener('resize', place);
    addEventListener('scroll', place, { passive: true });
    show(0);
  }

  function stop(finished = false) {
    if (index < 0) return;
    index = -1;
    layer?.remove();
    document.removeEventListener('keydown', onKey);
    removeEventListener('resize', place);
    removeEventListener('scroll', place);
    onEnd(finished);
  }

  return { start, stop, running: () => index >= 0 };
}
