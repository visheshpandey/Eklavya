// The global motion layer: smooth scroll (Lenis), scroll reveals, number count-ups, bars filling, the tab change, hover lift and tilt, the
// streak flame, the route checkmark and the confetti. All 2D motion is GSAP + ScrollTrigger. Everything here only decorates what the
// components already drew: it watches the page for new elements instead of changing how they are made.
import { selectToday, selectView } from '../state/selectors.js';
import { PALETTE, finePointer, loadScript } from './env.js';
import { CHECK, FLAME } from './lottie-data.js';

const REVEAL = '.hero, .section, .card, .stat, .sub, .rstep, .plan-group, .map-frame, .doc, .badge, .lb-row, .group-card, .block';
const COUNT = '.stat strong, #streakDays, .sub .row strong';
const BARS = '.bar > i, .meter > span';
const TILT = '.card, .stat, .sub, .mode';
const NO_TILT = 'textarea, input, select, .card3, .call, dialog';
const seen = new Set();          // things already animated once: a re-draw with the same content must not play again
const once = (key) => (seen.has(key) ? false : (seen.add(key), true));
const visible = (node) => node.isConnected && node.offsetParent !== null;
const keyOf = (node, tag) => `${tag}|${node.className}|${(node.textContent || '').trim().slice(0, 40)}|${[...node.parentElement.children].indexOf(node)}`;

export async function initMotion({ store }) {
  await Promise.all([loadScript('vendor/gsap.min.js'), loadScript('vendor/lenis.min.js'), loadScript('vendor/lottie_light.min.js'), loadScript('vendor/confetti.browser.js')]);
  await loadScript('vendor/ScrollTrigger.min.js');
  const { gsap, ScrollTrigger, Lenis, lottie, confetti } = globalThis;
  gsap.registerPlugin(ScrollTrigger);
  document.documentElement.dataset.motion = 'on';

  // ---- smooth scroll, driven by GSAP's own clock so ScrollTrigger and Lenis never disagree
  const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, prevent: (node) => Boolean(node.closest?.('dialog, [role="dialog"], textarea, select, .chat, .call, .topmenu, .menu')) });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // ---- reveals: fade + a 16px rise, 0.06s apart, as each thing scrolls into view
  function reveal(root = document) {
    const fresh = [...root.querySelectorAll(REVEAL)].filter((node) => visible(node) && !node.dataset.rv && node.getBoundingClientRect().height > 0);
    const toPlay = [];
    for (const node of fresh) {
      node.dataset.rv = '1';
      if (once(keyOf(node, 'rv'))) toPlay.push(node);
    }
    if (!toPlay.length) return;
    gsap.set(toPlay, { opacity: 0, y: 16 });
    ScrollTrigger.batch(toPlay, {
      start: 'top 94%', once: true,
      onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out', stagger: 0.06, overwrite: 'auto', clearProps: 'opacity,transform' }),
    });
  }

  // ---- numbers count up when they come into view
  function counts(root = document) {
    for (const node of root.querySelectorAll(COUNT)) {
      if (!visible(node) || node.dataset.cu || node.children.length) continue;
      node.dataset.cu = '1';
      const text = node.textContent;
      const match = /\d+/.exec(text);
      if (!match || !once(keyOf(node, 'cu'))) continue;
      const target = Number(match[0]);
      if (!target || target > 100000) continue;
      const width = match[0].startsWith('0') ? match[0].length : 0;
      const [before, after] = [text.slice(0, match.index), text.slice(match.index + match[0].length)];
      const write = (value) => { node.textContent = `${before}${String(Math.round(value)).padStart(width, '0')}${after}`; };
      const counter = { value: 0 };
      write(0);
      ScrollTrigger.create({ trigger: node, start: 'top 96%', once: true,
        onEnter: () => gsap.to(counter, { value: target, duration: 1.1, ease: 'power2.out', onUpdate: () => write(counter.value), onComplete: () => write(target) }) });
    }
  }

  // ---- bars (and the thin meters) fill from empty when they are seen
  function bars(root = document) {
    for (const node of root.querySelectorAll(BARS)) {
      if (!visible(node) || node.dataset.bar) continue;
      node.dataset.bar = '1';
      const target = node.style.width;
      if (!target || !once(`bar|${node.parentElement.parentElement?.textContent.slice(0, 40)}|${target}`)) continue;
      node.style.width = '0%';
      ScrollTrigger.create({ trigger: node.parentElement, start: 'top 96%', once: true, onEnter: () => gsap.to(node, { width: target, duration: 0.9, ease: 'power3.out' }) });
    }
  }

  // ---- the checkmark that draws itself when a route step is ticked
  function checks(root = document) {
    for (const mark of root.querySelectorAll('.rstep.done .mk:not([data-lt])')) {
      mark.dataset.lt = '1';
      mark.textContent = '';
      mark.setAttribute('aria-label', 'done');
      lottie.loadAnimation({ container: mark, renderer: 'svg', loop: false, autoplay: true, animationData: CHECK });
    }
  }

  // ---- confetti when all three steps of the route are done
  let doneBefore = null;
  function watchRoute() {
    const now = document.querySelectorAll('#route .rstep.done').length;
    const total = document.querySelectorAll('#route .rstep').length;
    if (doneBefore !== null && total && now === total && doneBefore < total) celebrate(document.getElementById('route'));
    if (total) doneBefore = now;
  }
  function celebrate(near) {
    const box = near?.getBoundingClientRect();
    const origin = box ? { x: (box.left + box.width / 2) / innerWidth, y: Math.min(0.85, (box.top + box.height / 3) / innerHeight) } : { x: 0.5, y: 0.6 };
    confetti({ particleCount: 90, spread: 70, startVelocity: 38, origin, colors: [PALETTE.terracotta, PALETTE.gold, PALETTE.green, PALETTE.greenSoft], disableForReducedMotion: true, ticks: 160 });
  }

  // one pass over what is on screen now, and again whenever the components draw something new
  const main = document.getElementById('main') ?? document.body;
  const pass = (root) => { reveal(root); counts(root); bars(root); checks(root); watchRoute(); };
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; pass(main); });   // before the next paint, so nothing flashes
  }).observe(main, { childList: true, subtree: true });
  pass(main);

  // ---- changing tab: a short crossfade with a 12px slide
  let first = true;
  store.select(selectView, (view) => {
    if (first) { first = false; return; }
    const panel = document.getElementById(`panel-${view}`);
    if (panel) gsap.fromTo(panel, { autoAlpha: 0, x: 12 }, { autoAlpha: 1, x: 0, duration: 0.32, ease: 'power2.out', clearProps: 'transform,opacity,visibility' });
    lenis.scrollTo(0, { immediate: true });
    requestAnimationFrame(() => { pass(main); ScrollTrigger.refresh(); });
  });

  // ---- hover lift and a gentle tilt toward the pointer (at most 6 degrees), only with a mouse
  if (finePointer()) {
    let current = null;
    const rest = (node) => gsap.to(node, { rotationX: 0, rotationY: 0, y: 0, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
    document.addEventListener('pointermove', (event) => {
      const node = event.target.closest?.(TILT);
      const next = node && !node.closest(NO_TILT) && !node.querySelector(NO_TILT) ? node : null;
      if (current && current !== next) rest(current);
      current = next;
      if (!next) return;
      const box = next.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5, y = (event.clientY - box.top) / box.height - 0.5;
      gsap.to(next, { rotationX: -y * 12, rotationY: x * 12, y: -4, transformPerspective: 900, duration: 0.35, ease: 'power2.out', overwrite: 'auto' });
    }, { passive: true });
    document.addEventListener('pointerleave', () => { if (current) { rest(current); current = null; } });
  }

  // ---- a mode card grows into the session: a ghost of the card flies to the stage, then fades as the session shows through
  document.addEventListener('click', (event) => {
    const card = event.target.closest?.('.mode');
    if (!card) return;
    const from = card.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'flip-ghost';
    Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.append(ghost);
    setTimeout(() => {   // by now the session has started and the stage is on screen
      const to = document.querySelector('.stage')?.getBoundingClientRect();
      if (!to || !to.width || document.getElementById('panel-study')?.offsetParent === null) { ghost.remove(); return; }
      gsap.to(ghost, { left: to.left, top: to.top, width: to.width, height: to.height, duration: 0.45, ease: 'power3.inOut',
        onComplete: () => gsap.to(ghost, { opacity: 0, duration: 0.3, onComplete: () => ghost.remove() }) });
    }, 140);
  }, true);

  // ---- the streak flame in the sidebar: lit and bigger the longer the streak
  const flame = document.createElement('span');
  flame.className = 'flame'; flame.setAttribute('aria-hidden', 'true');
  document.querySelector('.streakcard')?.append(flame);
  const flameAnimation = lottie.loadAnimation({ container: flame, renderer: 'svg', loop: true, autoplay: true, animationData: FLAME });
  const seenKey = 'eklavya.streak.seen';
  const readSeen = () => { try { return localStorage.getItem(seenKey); } catch { return null; } };
  store.select(selectToday, (today) => {
    if (!today) return;
    const streak = today.streak ?? 0;
    flame.classList.toggle('is-out', streak === 0);
    flameAnimation[streak ? 'play' : 'pause']();
    gsap.to(flame, { scale: 0.55 + 0.45 * Math.min(streak, 21) / 21, duration: 0.8, ease: 'back.out(2)', transformOrigin: '50% 100%' });
    const before = readSeen();
    if (before !== null && streak > Number(before)) celebrate(document.querySelector('.streakcard'));   // a new streak day, not the first visit
    try { localStorage.setItem(seenKey, String(streak)); } catch { /* private window: no celebration next time */ }
  });
}
