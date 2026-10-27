// Acceptance checks from the manual QA pass (real Chrome, fake microphone, real backend and Gemini).
// Run one group or all:  node qa.mjs [nav|lang|notes|quiz|ui]     Use a throwaway backend: see README.md
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONT = process.env.FRONT || 'http://localhost:3000';
const API = process.env.API || 'http://localhost:5002';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.env.OUT || path.join(here, 'out');
const DB = process.env.DB_PATH || '';          // the backend's database file (to read the right answers for the quiz check)
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--no-first-run'] });
const errors = [];

async function newPage({ width = 1280, height = 1000, onboarded = true } = {}) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.setViewport({ width, height });
  await page.evaluateOnNewDocument((skip) => {
    if (skip) localStorage.setItem('eklavya.onboarded', '1');
    const Real = window.WebSocket;
    window.__ws = [];
    window.WebSocket = class extends Real { constructor(url, p) { super(url, p); window.__ws.push(url); } };
  }, onboarded);
  await page.goto(`${FRONT}/?api=${API}`, { waitUntil: 'networkidle0' });
  return page;
}
const topicRow = (page, name) => page.evaluate((n) => [...document.querySelectorAll('.topic-row')].find((r) => r.textContent.includes(n)).click(), name);
const studyTitle = (page) => page.$eval('.study-title', (n) => n.textContent).catch(() => null);
const sockets = (page) => page.evaluate(() => window.__ws.length);

// ------------------------------------------------------------------ #1 #2 navigation
if (!only || only === 'nav') {
  const page = await newPage();
  const exam = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  await fetch(`${API}/api/plan`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ exam_date: exam, minutes_per_day: 45 }) });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.plan-day .chip');
  const chip = await page.$eval('.plan-day .chip', (n) => n.textContent);
  await page.click('.plan-day .chip');
  await wait(800);
  check('#1 exam planner chip opens the topic and starts no call', (await sockets(page)) === 0 && (await page.$eval('#app', (n) => n.dataset.view)) === 'study',
    `${chip} -> ${await studyTitle(page)}, orb "${await page.$eval('#orb', (n) => n.getAttribute('aria-label'))}"`);
  await page.click('#tab-progress');
  await page.waitForSelector('.map-list button');
  for (const name of ['F1 Score', 'Confusion Matrix']) {
    await page.evaluate((n) => [...document.querySelectorAll('.map-list button')].find((b) => b.textContent.startsWith(n)).click(), name);
    await wait(700);
    check(`#1 concept-map list "${name}" opens the topic, orb stays idle`, (await studyTitle(page)) === name && (await sockets(page)) === 0
      && (await page.$eval('#orb', (n) => n.dataset.state)) === 'idle');
    await page.click('#tab-progress');
  }
  await page.click('#tab-study');
  await topicRow(page, 'Precision');
  await page.waitForFunction(() => document.querySelector('.study-title')?.textContent === 'Precision');
  await page.evaluate(() => [...document.querySelectorAll('.study-actions .btn')].find((b) => /Quick revision/.test(b.textContent)).click());
  await wait(1500);
  const url = await page.evaluate(() => window.__ws.at(-1));
  const precId = Number(new URL(url).searchParams.get('topic_id'));
  const precision = await fetch(`${API}/api/topics/${precId}`).then((r) => r.json());
  check('#2 Quick revision on the open topic (Precision) revises Precision', url.includes('mode=revise') && precision.topic_name === 'Precision', url.split('?')[1]);
  await page.waitForSelector('#board:not([hidden])', { timeout: 60000 }).catch(() => {});
  check('#2 its whiteboard is about Precision', /precision/i.test(await page.$eval('#board', (n) => n.innerText).catch(() => '')));
  await page.evaluate(() => { const o = document.getElementById('orb'); if (o.dataset.state !== 'idle') o.click(); });
  await page.close();
}

// ------------------------------------------------------------------ #7 #8 #9 #6 language, empty state, demo button, photo errors
if (!only || only === 'lang' || only === 'notes') {
  const page = await newPage();
  await page.select('#lang', 'english');
  await page.reload({ waitUntil: 'networkidle0' });
  check('#7 English is still selected after reload', (await page.$eval('#lang', (n) => n.value)) === 'english' && (await page.evaluate(() => localStorage.getItem('eklavya.lang'))) === 'english');
  await page.select('#lang', 'hinglish');
  await page.close();

  const empty = await browser.newPage();
  await empty.setViewport({ width: 1280, height: 900 });
  await empty.evaluateOnNewDocument(() => { localStorage.setItem('eklavya.onboarded', '1'); localStorage.setItem('eklavya.lang', 'hindi'); });
  await empty.setRequestInterception(true);
  empty.on('request', (req) => {
    if (req.url().includes('/api/dashboard')) {
      req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ mastery: [], weak_topics: [], alerts: [], mission: null, quiz_history: [], progress: [], misconceptions_resolved: 0, learner_state: [], agent_log: [], mistakes: [] }) });
    } else req.continue();
  });
  await empty.goto(`${FRONT}/?api=${API}`, { waitUntil: 'networkidle0' });
  const text = await empty.$eval('#library', (n) => n.innerText);
  check('#8 Hindi mode translates the Notes empty state', /अभी कोई नोट्स नहीं/.test(text) && !/No notes yet/.test(text), text.replace(/\n/g, ' | ').slice(0, 90));
  await empty.close();

  // #9 the demo button while the notes are still empty: an empty dashboard is served until the seed request goes through
  const demo = await browser.newPage();
  await demo.setViewport({ width: 1280, height: 900 });
  let seeds = 0, seeded = false;
  await demo.setRequestInterception(true);
  demo.on('request', (req) => {
    if (req.url().includes('/api/demo/seed')) { seeds++; seeded = true; req.continue(); }
    else if (req.url().includes('/api/dashboard') && !seeded) {
      req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ mastery: [], weak_topics: [], alerts: [], mission: null, quiz_history: [], progress: [], misconceptions_resolved: 0, learner_state: [], agent_log: [], mistakes: [] }) });
    } else req.continue();
  });
  await demo.evaluateOnNewDocument(() => { localStorage.removeItem('eklavya.onboarded'); localStorage.setItem('eklavya.lang', 'english'); });   // pages share the browser's storage
  await demo.goto(`${FRONT}/?api=${API}`, { waitUntil: 'networkidle0' });
  await demo.waitForSelector('#onboarding[open]');
  await demo.evaluate(() => [...document.querySelectorAll('.onb-choice')][1].click());
  await demo.evaluate(() => [...document.querySelectorAll('#onboarding .btn-primary')].find((b) => /Next/.test(b.innerText)).click());
  await demo.waitForFunction(() => [...document.querySelectorAll('#onboarding .btn-secondary')].some((b) => /demo/i.test(b.innerText)));
  await demo.evaluate(() => { const b = [...document.querySelectorAll('#onboarding .btn-secondary')].find((x) => /demo/i.test(x.innerText)); b.click(); b.click(); });
  await wait(60);
  const busy = await demo.evaluate(() => { const b = document.querySelector('#onboarding .btn-secondary'); return b ? { disabled: b.disabled, label: b.innerText, busy: b.getAttribute('aria-busy') } : null; });
  check('#9 the guide demo button is disabled and says Loading while it runs', !!busy && busy.disabled && /Loading/.test(busy.label) && busy.busy === 'true', JSON.stringify(busy));
  await wait(2500);
  check('#9 two quick clicks in the guide make one demo request', seeds === 1, `requests: ${seeds}`);
  await demo.close();

  const side = await browser.newPage();
  await side.setViewport({ width: 1280, height: 900 });
  seeds = 0; seeded = false;
  await side.setRequestInterception(true);
  side.on('request', (req) => {
    if (req.url().includes('/api/demo/seed')) { seeds++; seeded = true; req.continue(); }
    else if (req.url().includes('/api/dashboard') && !seeded) {
      req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ mastery: [], weak_topics: [], alerts: [], mission: null, quiz_history: [], progress: [], misconceptions_resolved: 0, learner_state: [], agent_log: [], mistakes: [] }) });
    } else req.continue();
  });
  await side.evaluateOnNewDocument(() => localStorage.setItem('eklavya.onboarded', '1'));
  await side.goto(`${FRONT}/?api=${API}`, { waitUntil: 'networkidle0' });
  await side.evaluate(() => { const b = document.getElementById('btnDemo'); b.click(); b.click(); });
  await wait(60);
  const sideBusy = await side.$eval('#btnDemo', (b) => ({ disabled: b.disabled, label: b.innerText }));
  await wait(2500);
  const sideAfter = await side.$eval('#btnDemo', (b) => ({ disabled: b.disabled, label: b.innerText }));
  check('#9 the sidebar demo button is disabled and says Loading, then recovers; one request', sideBusy.disabled && /Loading/.test(sideBusy.label) && !sideAfter.disabled && /demo notes/i.test(sideAfter.label) && seeds === 1,
    `${JSON.stringify(sideBusy)} -> ${JSON.stringify(sideAfter)}, requests ${seeds}`);
  await side.close();

  const photo = await newPage();
  let calls = 0;
  await photo.setRequestInterception(true);
  photo.on('request', (req) => {
    if (req.url().includes('/api/upload-document') && req.method() === 'POST') {
      calls++;
      if (calls === 1) req.respond({ status: 502, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ error: 'The photo reader is busy right now. Please try again in a minute.', code: 'llm_unavailable' }) });
      else setTimeout(() => req.respond({ status: 502, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ error: 'The photo reader is busy right now. Please try again in a minute.', code: 'llm_unavailable' }) }), 1200);
    } else req.continue();
  });
  const img = path.join(OUT, 'qa-photo.jpg');
  fs.writeFileSync(img, Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'));
  await photo.click('#tab-library').catch(() => {});
  const input = await photo.$('#file');
  await input.uploadFile(img);
  await photo.waitForFunction(() => document.getElementById('banner').innerText.length > 0, { timeout: 15000 });
  const banner = await photo.$eval('#banner', (n) => n.innerText);
  check('#6 a busy photo reader shows a friendly message, no raw error', /photo reader is busy/.test(banner) && !/503|UNAVAILABLE|\{/.test(banner), banner);
  await input.uploadFile(img);
  await wait(300);
  const during = await photo.$eval('#banner', (n) => (n.hidden ? '' : n.innerText));
  check('#6 the old error is cleared when a new upload starts', during === '', JSON.stringify(during));
  await photo.close();
}

// ------------------------------------------------------------------ #3 #4 #5 #11 #12 #13 #14 #20 the 3-question test
if (!only || only === 'quiz') {
  const page = await newPage();
  await page.click('#tab-study');
  await page.waitForFunction(() => document.querySelectorAll('.topic-row').length >= 5);
  await topicRow(page, 'Recall');
  await page.waitForFunction(() => document.querySelector('.study-title')?.textContent === 'Recall');
  // the correct letter of every question on this topic, in the order the tutor will ask them
  const correctOf = (qText) => { try { return execFileSync('python', ['-I', '-c',
    'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); r=c.execute("select correct from quiz_questions where question=?", (sys.argv[2],)).fetchone(); print(r[0] if r else "")', DB, qText], { encoding: 'utf-8' }).trim(); } catch { return ''; } };
  await page.evaluate(() => document.getElementById('quizcard'));
  await page.evaluate(() => {   // record how long each result block stays on screen
    window.__results = [];
    new MutationObserver(() => {
      const r = document.querySelector('#quizcard .result');
      const last = window.__results.at(-1);
      if (r && (!last || last.end)) window.__results.push({ ok: r.classList.contains('ok'), start: performance.now(), end: null, text: r.innerText.replace(/\n/g, ' ') });
      if (!r && last && !last.end) last.end = performance.now();
    }).observe(document.getElementById('quizcard'), { childList: true, subtree: true, attributes: true });
  });
  await page.evaluate(() => [...document.querySelectorAll('.study-actions .btn')].find((b) => /Just test me/.test(b.textContent)).click());
  const seenNumbers = [];
  let answered = 0;
  const deadline = Date.now() + 200000;
  while (Date.now() < deadline && answered < 3) {
    const q = await page.evaluate(() => {
      const card = document.getElementById('quizcard');
      if (card.hidden || card.querySelector('.result')) return null;
      return { n: card.querySelector('.quiz-count')?.textContent, text: card.querySelector('.q-text')?.textContent };
    });
    if (q && !seenNumbers.includes(q.n)) {
      seenNumbers.push(q.n);
      const right = correctOf(q.text);
      const pick = answered === 1 ? ['A', 'B', 'C', 'D'].find((l) => l !== right) : right || 'B';   // question 2 is answered wrong on purpose
      await wait(2500);                                    // let the tutor read it
      await page.evaluate((letter) => [...document.querySelectorAll('#quizcard .opt')].find((b) => b.textContent.trim().startsWith(letter)).click(), pick);
      answered++;
      await wait(1500);
      if (answered === 2) {                                // the tutor follows a wrong answer up: answer it correctly by typing
        await wait(9000);
        await page.waitForFunction(() => !document.getElementById('textin').disabled, { timeout: 20000 });
        await page.type('#textin', right);
        await page.keyboard.press('Enter');
      }
    }
    await wait(700);
  }
  await page.waitForSelector('#summary:not([hidden])', { timeout: 120000 }).catch(() => {});
  await wait(3000);
  const summary = await page.$eval('#summary', (n) => (n.hidden ? 'none' : n.innerText.replace(/\n/g, ' '))).catch(() => 'none');
  check('#3 all three questions were shown', seenNumbers.length >= 3 && seenNumbers.some((n) => /3 of 3/.test(n)), seenNumbers.join(' | '));
  check('#3 the summary counts 3 questions (follow-up did not use a slot)', /of 3 correct/.test(summary), summary.slice(0, 80));
  const results = await page.evaluate(() => window.__results.map((r) => ({ ok: r.ok, ms: r.end ? Math.round(r.end - r.start) : null, text: r.text.slice(0, 60) })));
  console.log('      results seen:', JSON.stringify(results));
  const correct = results.filter((r) => r.ok);
  check('#4 every "Correct" result stayed visible at least 2 s', correct.length > 0 && correct.every((r) => r.ms === null || r.ms >= 2000), JSON.stringify(correct.map((r) => r.ms)));
  const chat = await page.$eval('#chat', (n) => n.innerText);
  check('#5 no "<no speech>" anywhere in the chat', !/<no speech>|\{pause\}/i.test(chat));
  const order = await page.$$eval('#chat .msg', (ms) => ms.map((m) => m.classList.contains('user') ? 'user' : 'tutor'));
  const typedAt = await page.$$eval('#chat .msg.user', (ms) => ms.map((m) => m.innerText.replace(/\n/g, ' ')));
  check('#5 typed answers are in the log, between the tutor turns', order.includes('user') && order.indexOf('user') > 0, `${order.join(',')} | ${typedAt.join(' / ')}`);
  const steps = await page.$$eval('#stepper .step', (s) => s.map((n) => n.classList.contains('is-done')));
  check('#11 the Summary step is done once the summary shows (every step of this mode)', steps.length >= 2 && steps.every(Boolean), JSON.stringify(steps));
  await page.waitForFunction(() => !document.getElementById('studyMission').hidden, { timeout: 60000 }).catch(() => {});
  const mission = await page.$eval('#studyMission', (n) => (n.hidden ? 'hidden' : n.innerText.replace(/\n/g, ' '))).catch(() => 'hidden');
  const recallNow = (await fetch(`${API}/api/dashboard`).then((r) => r.json())).mastery.find((m) => m.topic_name === 'Recall').mastery_score;
  check('#12 the mission shows in Study after the summary', mission !== 'hidden', mission.slice(0, 110));
  console.log(`      Recall mastery now ${Math.round(recallNow)}%; mission text mentions: ${(mission.match(/\d+%/g) || []).join(', ') || 'no percentage'}`);
  await page.screenshot({ path: path.join(OUT, 'qa-quiz.png'), fullPage: true });

  // study pack: every mistake (resolved marked) + boards of the whole day
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await page.click('#tab-progress');
  await page.click('#btnPack');
  await page.waitForFunction(() => window.__printed, { timeout: 15000 });
  const pack = await page.$eval('#printPack', (n) => n.innerText);
  check('#13 the study pack has a Mistakes section', /Mistakes/.test(pack) && /(resolved|to fix)/.test(pack), (pack.match(/\(resolved\)|\(to fix\)/g) || []).join(' '));
  check('#13 the study pack lists today\'s whiteboards', /Whiteboards from today/.test(pack));

  // flashcards from the mistakes
  await page.evaluate(() => [...document.querySelectorAll('.flashcards .btn')].find((b) => /Make cards/.test(b.innerText)).click());
  await page.waitForSelector('.flashcard', { timeout: 120000 }).catch(() => {});
  const cards = await page.evaluate(async () => (await (await fetch(location.search.match(/api=([^&]+)/)[1] + '/api/flashcards')).json()).cards);
  const mistake = cards.find((c) => c.source === 'mistake');
  check('#20 a mistake flashcard shows the real question in front and the answer behind', !!mistake && !/^A mistake you made/.test(mistake.front) && /Answer:/.test(mistake.back), mistake ? `${mistake.front.slice(0, 50)} -> ${mistake.back.slice(0, 50)}` : 'no mistake card');

  // #14 another topic: the old conversation is gone
  await page.evaluate(() => { const o = document.getElementById('orb'); if (o.dataset.state !== 'idle') o.click(); });
  await wait(800);
  await page.click('#tab-study');
  const before = await page.$$eval('#chat .msg', (m) => m.length);
  await topicRow(page, 'Precision');
  await wait(800);
  const after = await page.$$eval('#chat .msg', (m) => m.length);
  check('#14 opening another topic clears the old conversation', before > 0 && after === 0, `messages ${before} -> ${after}`);
  await page.close();
}

// ------------------------------------------------------------------ #19 #21 and the quality bar: layout, many topics, phone, focus
if (!only || only === 'ui') {
  const page = await newPage();
  await page.click('#tab-study');
  await page.waitForFunction(() => document.querySelectorAll('.topic-row').length >= 5);
  await topicRow(page, 'Precision');
  await page.waitForSelector('.debate');
  await page.evaluate(() => { document.querySelector('.debate').open = true; });
  await wait(300);
  const box = await page.$eval('.debate .notes-body', (n) => ({ client: n.clientHeight, scroll: n.scrollHeight, max: getComputedStyle(n).maxHeight }));
  check('#19 the debate setup form is not in a scroll box', box.scroll <= box.client + 1 && box.max === 'none', JSON.stringify(box));
  await page.screenshot({ path: path.join(OUT, 'qa-debate-form.png') });

  await page.setRequestInterception(true);
  const nodes = Array.from({ length: 16 }, (_, i) => ({ id: 100 + i, topic: `A fairly long topic name number ${i + 1}`, document_id: 1, mastery: (i * 6) % 100 }));
  page.on('request', (req) => {
    if (req.url().includes('/api/concept-map')) req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ nodes, links: [{ source: 100, target: 101, weight: 2 }] }) });
    else req.continue();
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.click('#tab-progress');
  await page.waitForSelector('.map-svg');
  const map = await page.evaluate(() => ({ dots: document.querySelectorAll('.map-dot').length, labels: document.querySelectorAll('.map-label').length, list: document.querySelectorAll('.map-list li').length, titles: document.querySelectorAll('.map-node title').length }));
  check('#21 with 16 topics the map has no overlapping labels (names are in the list and tooltips)', map.dots === 16 && map.labels === 0 && map.list === 16 && map.titles === 16, JSON.stringify(map));
  await page.screenshot({ path: path.join(OUT, 'qa-map16.png'), fullPage: true });
  await page.close();

  const phone = await newPage({ width: 390, height: 844 });
  for (const tab of ['today', 'study', 'progress', 'library']) {
    await phone.click(`#tab-${tab}`);
    await wait(300);
    const sw = await phone.evaluate(() => document.documentElement.scrollWidth);
    check(`phone 390px: no sideways scroll on ${tab}`, sw <= 390, `scrollWidth ${sw}`);
  }
  await phone.click('#tab-today');
  let bad = [];
  for (let i = 0; i < 14; i++) {
    await phone.keyboard.press('Tab');
    const f = await phone.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e);
      return { tag: e.tagName.toLowerCase() + (e.id ? '#' + e.id : ''), outline: s.outlineStyle, width: parseFloat(s.outlineWidth), visible: e.matches(':focus-visible') }; });
    if (f && f.visible && (f.outline === 'none' || f.width < 2)) bad.push(f.tag);
  }
  check('Tab: every focused control shows a focus ring (first 14 stops)', bad.length === 0, bad.join(', '));
  await phone.close();
}

console.log(`\n${checks.filter(Boolean).length}/${checks.length} checks passed. Browser errors: ${JSON.stringify(errors)}`);
await browser.close();
