// The opening animation: a book opens and then flies to the book on the Today desk. Shown once per browser visit, never for a deep link
// (a reminder, a reset link), never with "reduce motion", and always skippable (click, Skip, Escape). While it plays the page is inert.

/** Whether to play the intro (pure): not for reduced motion, a repeat visit or a link to a specific place. */
export function shouldPlayIntro({ reduceMotion, seen, deepLink }) {
  return !reduceMotion && !seen && !deepLink;
}

export function mountIntro({ intro, frame, nav, skip, getDesk, onDone, reduceMotion = false, deepLink = false, storage = globalThis.sessionStorage }) {
  let seen = false;
  try { seen = storage.getItem('eklavya-intro') === '1'; } catch { /* treated as not seen */ }
  const unlock = () => { frame.inert = false; if (nav) nav.inert = false; document.body.classList.add('ready'); };
  const waiting = [];   // things that must not open on top of the intro (the first-run guide)
  if (!shouldPlayIntro({ reduceMotion, seen, deepLink })) { unlock(); return { end() {}, whenDone: (callback) => callback() }; }
  try { storage.setItem('eklavya-intro', '1'); } catch { /* it may play again next visit */ }

  let finished = false;
  let opened = false;
  let timer = null;
  const desk = () => document.getElementById('desk');

  function end() {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    const target = getDesk()?.querySelector('.float');
    const done = () => { intro.hidden = true; desk()?.classList.remove('waiting'); unlock(); onDone?.(); waiting.splice(0).forEach((callback) => callback()); };
    const box = target?.getBoundingClientRect();
    const canFly = opened && box && box.top >= 0 && box.bottom <= innerHeight && box.width > 0;
    if (!canFly) {   // skipped early, or the desk is not on screen: a plain fade
      desk()?.classList.remove('waiting');
      intro.classList.add('out');
      frame.classList.add('enter');
      setTimeout(done, 320);
      return;
    }
    const fly = document.getElementById('ifly');
    const from = fly.getBoundingClientRect();
    const dx = (box.left + box.width / 2) - (from.left + from.width / 2);
    const dy = (box.top + box.height / 2) - (from.top + from.height / 2);
    fly.style.transition = 'transform .9s cubic-bezier(.65,0,.25,1)';
    fly.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(${(260 / 400).toFixed(3)})`;
    intro.classList.add('landing');
    intro.style.cursor = 'default';
    setTimeout(() => { desk()?.classList.remove('waiting'); intro.classList.add('out'); }, 900);
    setTimeout(done, 1220);
  }

  intro.hidden = false;
  desk()?.classList.add('waiting');
  frame.inert = true;
  if (nav) nav.inert = true;
  requestAnimationFrame(() => requestAnimationFrame(() => intro.classList.add('go')));
  setTimeout(() => { opened = true; }, 2300);
  timer = setTimeout(end, 3300);
  intro.addEventListener('click', end);
  skip.addEventListener('click', (event) => { event.stopPropagation(); end(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !finished) end(); });
  skip.focus({ preventScroll: true });
  return { end, whenDone: (callback) => (finished && intro.hidden ? callback() : waiting.push(callback)) };
}
