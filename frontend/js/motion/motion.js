// The global motion layer: smooth scroll (Lenis), scroll reveals, number count-ups, bars filling, the tab change, hover lift and tilt, the
// streak flame, the route checkmark and the confetti. All 2D motion is GSAP + ScrollTrigger. Everything here only decorates what the
// components already drew: it watches the page for new elements instead of changing how they are made.
import { selectToday, selectView } from '../state/selectors.js';
import { PALETTE, finePointer, loadScript } from './env.js';
import { canScene, mountOnScreen } from './index.js';
import { CHECK, DOWNLOAD, FLAME } from './lottie-data.js';

const REVEAL = '.hero, .section, .card, .stat, .sub, .rstep, .plan-group, .map-frame, .doc, .badge, .lb-row, .group-card, .block, .topic-row';
const COUNT = '.stat strong, #streakDays, .sub .row strong, .mring-num';
const BARS = '.bar > i, .meter > span';
const TILT = '.card, .stat, .sub, .mode';
const NO_TILT = 'textarea, input, select, .card3, .call, dialog';
const seen = new Set();          // things already animated once: a re-draw with the same content must not play again
const once = (key) => (seen.has(key) ? false : (seen.add(key), true));
let booting = true;   // the first pass: what is already on screen when the layer starts is left alone (hiding it now would only make it flash)
const inView = (node) => node.getBoundingClientRect().top < innerHeight;
const visibleNow = (node) => node.isConnected && node.offsetParent !== null && node.getBoundingClientRect().top < innerHeight;
const visible = (node) => node.isConnected && node.offsetParent !== null && !(booting && inView(node));
const keyOf = (node, tag) => `${tag}|${node.className}|${(node.textContent || '').trim().slice(0, 40)}|${[...node.parentElement.children].indexOf(node)}`;

export async function initMotion({ store }) {
  await Promise.all([loadScript('vendor/gsap.min.js'), loadScript('vendor/MotionPathPlugin.min.js'), loadScript('vendor/lenis.min.js'), loadScript('vendor/lottie_light.min.js'), loadScript('vendor/confetti.browser.js')]);
  await loadScript('vendor/ScrollTrigger.min.js');
  const { gsap, ScrollTrigger, Lenis, lottie, confetti } = globalThis;
  gsap.registerPlugin(ScrollTrigger, globalThis.MotionPathPlugin);
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

  // ---- the mastery ring fills from empty
  function rings(root = document) {
    for (const circle of root.querySelectorAll('.mring .fg')) {
      if (!visible(circle) || circle.dataset.ring) continue;
      circle.dataset.ring = '1';
      const full = Number(circle.dataset.circ), target = parseFloat(circle.style.strokeDashoffset);
      if (!once(`ring|${target}`)) continue;
      circle.style.strokeDashoffset = String(full);
      ScrollTrigger.create({ trigger: circle, start: 'top 96%', once: true, onEnter: () => gsap.to(circle.style, { strokeDashoffset: target, duration: 1.4, ease: 'power3.out' }) });
    }
  }

  // ---- "Download study pack": a small arrow-into-tray animation pops up over the button
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#btnPack');
    if (!button) return;
    const bubble = document.createElement('span');
    bubble.className = 'dl-bubble';
    bubble.setAttribute('aria-hidden', 'true');
    const box = button.getBoundingClientRect();
    Object.assign(bubble.style, { left: `${box.left + box.width / 2}px`, top: `${box.top - 8}px` });
    document.body.append(bubble);
    const animation = lottie.loadAnimation({ container: bubble, renderer: 'svg', loop: false, autoplay: true, animationData: DOWNLOAD });
    gsap.fromTo(bubble, { y: 6, opacity: 0, scale: 0.8 }, { y: -10, opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' });
    gsap.to(bubble, { opacity: 0, delay: 1.5, duration: 0.3, onComplete: () => { animation.destroy(); bubble.remove(); } });
  }, true);

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

  // ---- flashcards: the card flips with a spring, can be thrown (right = Got it, left = Again, up = Hard), and the Leitner boxes are 3D
  const review = document.getElementById('fcReview');
  const spring = (card) => gsap.fromTo(card, { rotationY: card.classList.contains('flipped') ? 0 : 180 }, { rotationY: card.classList.contains('flipped') ? 180 : 0, duration: 1.15, ease: 'elastic.out(1, 0.5)', overwrite: true });
  if (review) {
    new MutationObserver((records) => { for (const record of records) if (record.target.classList?.contains('card3')) spring(record.target); })
      .observe(review, { attributes: true, attributeFilter: ['class'], subtree: true });
    let drag = null, suppress = false;
    review.addEventListener('pointerdown', (event) => {
      const card = event.target.closest('.card3');
      if (!card || event.button > 0) return;
      drag = { wrap: card.closest('.flip'), x: event.clientX, y: event.clientY, dx: 0, dy: 0, moved: false };
    });
    review.addEventListener('pointermove', (event) => {
      if (!drag) return;
      drag.dx = event.clientX - drag.x; drag.dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(drag.dx, drag.dy) > 8) drag.moved = true;
      if (!drag.moved) return;
      gsap.set(drag.wrap, { x: drag.dx, y: drag.dy, rotation: drag.dx * 0.05 });
      drag.wrap.dataset.throw = drag.dy < -70 && Math.abs(drag.dy) > Math.abs(drag.dx) ? 'hard' : drag.dx > 70 ? 'known' : drag.dx < -70 ? 'again' : '';
    });
    const release = () => {
      if (!drag) return;
      const { wrap, dx, dy, moved } = drag;
      drag = null;
      if (!moved) return;
      suppress = true;   // the click that follows a drag must not flip the card
      const choice = wrap.dataset.throw;
      delete wrap.dataset.throw;
      const button = choice && review.querySelector('.card3.flipped') && review.querySelector(`[data-rate="${choice}"]:not(:disabled)`);
      if (!button) { gsap.to(wrap, { x: 0, y: 0, rotation: 0, duration: 0.7, ease: 'elastic.out(1, 0.6)' }); return; }
      gsap.to(wrap, { x: choice === 'known' ? 700 : choice === 'again' ? -700 : dx, y: choice === 'hard' ? -420 : dy, rotation: choice === 'known' ? 25 : choice === 'again' ? -25 : 0, opacity: 0, duration: 0.32, ease: 'power2.in',
        onComplete: () => { gsap.set(wrap, { clearProps: 'all' }); button.click(); } });
    };
    review.addEventListener('pointerup', release);
    review.addEventListener('pointercancel', release);
    review.addEventListener('click', (event) => { if (suppress) { suppress = false; event.stopPropagation(); event.preventDefault(); } }, true);

    // the Leitner shelf in 3D; a rated card flies into its box along a curved path, the box gives, and a Got it sparkles
    const shelfHost = document.getElementById('fcShelf');
    if (shelfHost && canScene()) {
      let counts = [0, 0, 0, 0, 0, 0];
      const shelf = mountOnScreen(shelfHost, async (element) => (await import('./cards-3d.js')).createBoxes(element), (scene) => scene.setCounts(globalThis.eklavyaBoxes ?? counts));
      document.addEventListener('eklavya:cards', (event) => {
        const { type, boxes: next, to, value } = event.detail;
        if (type === 'counts') { counts = next; shelf.scene()?.setCounts(next); }
        if (type === 'rate') flyToBox(to, value, shelf.scene());
      });
    }
  }
  function flyToBox(to, value, scene) {
    const stage = document.querySelector('#fcReview .fcstage');
    const shelfBox = document.getElementById('fcShelf')?.getBoundingClientRect();
    if (!stage || !shelfBox || !scene) return;
    const from = stage.getBoundingClientRect();
    const targetX = shelfBox.left + shelfBox.width * scene.xFraction(to), targetY = shelfBox.top + shelfBox.height * 0.62;
    const ghost = document.createElement('div');
    ghost.className = 'fc-ghost';
    Object.assign(ghost.style, { left: `${from.left + from.width / 2}px`, top: `${from.top + from.height / 2}px` });
    document.body.append(ghost);
    const dx = targetX - (from.left + from.width / 2), dy = targetY - (from.top + from.height / 2);
    gsap.timeline({ onComplete: () => {
      ghost.remove();
      scene.land(to);
      if (value === 'known') confetti({ particleCount: 16, spread: 55, startVelocity: 18, scalar: 0.55, gravity: 0.8, ticks: 60, disableForReducedMotion: true, colors: [PALETTE.gold, PALETTE.greenSoft],
        origin: { x: targetX / innerWidth, y: targetY / innerHeight } });
    } })
      .to(ghost, { duration: 0.85, ease: 'power2.inOut', scale: 0.4, rotation: value === 'again' ? -200 : 200, motionPath: { path: [{ x: dx * 0.35, y: -Math.min(140, Math.abs(dy) * 0.6) - 40 }, { x: dx, y: dy }], curviness: 1.5 } });
  }

  // the empty deck gets a floating stack of cards
  function stacks(root) {
    for (const empty of root.querySelectorAll('#fcReview .card3-empty:not([data-stack])')) {
      empty.dataset.stack = '1';
      if (!canScene()) continue;
      const host = document.createElement('div');
      host.className = 'stack3d';
      empty.prepend(host);
      mountOnScreen(host, async (element) => (await import('./cards-3d.js')).createStack(element));
    }
  }

  // ---- study groups: members orbit the shared book
  function groups(root) {
    for (const detail of root.querySelectorAll('#groupsRoot .group-detail:not([data-orbit])')) {
      detail.dataset.orbit = '1';
      if (!canScene()) continue;
      const members = [...detail.querySelectorAll('.leaderboard li')].map((li) => ({ rank: Number(li.querySelector('.lb-rank')?.textContent) || 1,
        name: (li.querySelector('.lb-name')?.textContent ?? '').replace(/ \(you\)$/, ''), you: li.classList.contains('is-you') }));
      if (!members.length) continue;
      let host = detail.querySelector('.orbit3d');
      if (!host) { host = document.createElement('div'); host.className = 'orbit3d'; detail.prepend(host); }
      mountOnScreen(host, async (element) => {
        const scene = (await import('./group-orbit.js')).createGroupOrbit(element, members);
        host.classList.add('has-canvas');   // the animated 2D version fades out
        const dispose = scene.dispose;
        scene.dispose = () => { host.classList.remove('has-canvas'); dispose(); };
        return scene;
      }, () => {}, { wait: 500, onFail: () => host.classList.remove('has-canvas') });
    }
  }

  // ---- my notes: the dropped page flies into the 3D book, then the topics pop in
  let popUntil = 0;
  const drop = document.getElementById('drop');
  let playing = false;
  async function uploadFx() {
    popUntil = Date.now() + 25000;
    if (!drop || playing || !canScene()) return;
    playing = true;
    const host = document.createElement('div');
    host.className = 'dropfx';
    drop.append(host);
    try {
      const { createUploadFx } = await import('./notes-fx.js');
      const fx = createUploadFx(host);
      fx.play();
      setTimeout(() => { fx.dispose(); host.remove(); playing = false; }, 2600);
    } catch { host.remove(); playing = false; }
  }
  document.getElementById('file')?.addEventListener('change', uploadFx);
  drop?.addEventListener('drop', uploadFx);
  function pops(root) {
    if (Date.now() > popUntil) return;
    const fresh = [...root.querySelectorAll('#panel-library .topic-row:not([data-pop])')];
    fresh.forEach((row) => { row.dataset.pop = '1'; });
    if (fresh.length) gsap.fromTo(fresh, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2.2)', stagger: 0.045, clearProps: 'transform,opacity' });
  }

  // ---- ask: pages fan out while it searches, the answer arrives word by word, the cited words are underlined
  function ask(root) {
    for (const wait of root.querySelectorAll('#answer .ask-wait:not([data-fan])')) {
      wait.dataset.fan = '1';
      const fan = document.createElement('span');
      fan.className = 'fan'; fan.setAttribute('aria-hidden', 'true');
      fan.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
      wait.before(fan);
      const sheets = [...fan.children];
      gsap.set(sheets, { transformOrigin: '50% 100%', rotation: 0 });
      gsap.to(sheets, { rotation: (i) => (i - 2) * 17, duration: 0.9, ease: 'back.out(1.6)', stagger: 0.05, repeat: -1, yoyo: true, repeatDelay: 0.2 });
    }
    for (const block of root.querySelectorAll('#answer .answer > .md:not([data-words])')) {   // the answer's text arrives word by word (its markup is kept)
      block.dataset.words = '1';
      if (!once(`words|${block.textContent}`)) continue;
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('.frac, mark') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
      const texts = []; while (walker.nextNode()) texts.push(walker.currentNode);
      const spans = [];
      for (const node of texts) {
        const parts = node.textContent.split(/(\s+)/).map((word) => { if (/^\s+$/.test(word) || !word) return document.createTextNode(word); const span = document.createElement('span'); span.textContent = word; spans.push(span); return span; });
        node.replaceWith(...parts);
      }
      gsap.fromTo(spans, { opacity: 0 }, { opacity: 1, duration: 0.18, stagger: 0.03, ease: 'none' });
    }
    for (const mark of root.querySelectorAll('#answer .passage mark:not([data-uline])')) {
      mark.dataset.uline = '1';
      ScrollTrigger.create({ trigger: mark, start: 'top 92%', once: true, onEnter: () => mark.classList.add('uline') });
    }
  }

  document.addEventListener('eklavya:celebrate', (event) => celebrate(document.querySelector(event.detail?.near)));

  // one pass over what is on screen now, and again whenever the components draw something new
  const main = document.getElementById('main') ?? document.body;
  const pass = (root) => { reveal(root); counts(root); bars(root); rings(root); checks(root); stacks(root); groups(root); pops(root); ask(root); watchRoute(); };
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; pass(main); });   // before the next paint, so nothing flashes
  }).observe(main, { childList: true, subtree: true });
  pass(main);
  booting = false;

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

  // ---- the sidebar's active mark slides between tabs
  const tablist = document.querySelector('#tabs [role="tablist"]');
  if (tablist) {
    tablist.style.position = 'relative';
    const pip = document.createElement('span');
    pip.className = 'rail-pip'; pip.setAttribute('aria-hidden', 'true');
    tablist.prepend(pip);
    const place = (animate) => {
      const active = tablist.querySelector('[aria-selected="true"]');
      if (!active) return;
      const to = { y: active.offsetTop + 8, height: active.offsetHeight - 16 };
      if (animate) gsap.to(pip, { ...to, duration: 0.35, ease: 'power3.out' }); else gsap.set(pip, to);
    };
    place(false);
    store.select(selectView, () => requestAnimationFrame(() => place(true)));
    addEventListener('resize', () => place(false));
  }

  // ---- the quote types itself in the first time it is seen
  const quote = document.getElementById('quote');
  function typeIn(node) {
    const full = node.textContent;
    if (!full || !once('quote')) return;
    const progress = { n: 0 };
    node.setAttribute('aria-label', full);
    gsap.to(progress, { n: full.length, duration: Math.min(2.2, full.length * 0.03), ease: 'none', onUpdate: () => { node.textContent = full.slice(0, Math.round(progress.n)); }, onComplete: () => { node.textContent = full; node.removeAttribute('aria-label'); } });
  }
  if (quote) ScrollTrigger.create({ trigger: quote, start: 'top 92%', once: true, onEnter: () => typeIn(quote) });

  // ---- the study room's waveform: bars that move on their own, and swell with the live voice level during a session
  const waveBars = [...document.querySelectorAll('.wave i')];
  if (waveBars.length) {
    gsap.set(waveBars, { transformOrigin: '50% 50%' });
    document.documentElement.classList.add('wave-gsap');
    const phases = waveBars.map((_, i) => ({ speed: 1.3 + (i % 4) * 0.35, phase: i * 0.9 }));
    let level = 0;
    gsap.ticker.add((time) => {
      if (waveBars[0].offsetParent === null) return;
      const live = document.getElementById('app')?.hasAttribute('data-live');
      level += (((live ? globalThis.eklavyaLevel : 0) ?? 0) - level) * 0.2;
      waveBars.forEach((bar, i) => { const wobble = 0.55 + 0.35 * Math.sin(time * phases[i].speed + phases[i].phase); gsap.set(bar, { scaleY: wobble * (live ? 0.7 + level * 2.2 : 1) }); });
    });
  }

  // ---- a removed document slides away (and comes back if the removal did not happen)
  document.addEventListener('click', (event) => {
    const yes = event.target.closest?.('.doc-confirm .btn-danger');
    const doc = yes?.closest('.doc');
    if (!doc) return;
    gsap.to(doc, { opacity: 0, x: -24, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, duration: 0.45, ease: 'power2.in', overflow: 'hidden',
      onComplete: () => setTimeout(() => { if (doc.isConnected) gsap.set(doc, { clearProps: 'all' }); }, 3500) });
  }, true);

  // ---- new messages in the conversation slide in
  const chat = document.getElementById('chat');
  if (chat) new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1 && node.classList?.contains('msg') && !node.classList.contains('typing')) gsap.from(node, { y: 14, opacity: 0, duration: 0.35, ease: 'power2.out', clearProps: 'all' });
  }).observe(chat, { childList: true });

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
