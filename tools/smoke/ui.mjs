// Non-voice flows of phases 2-4 in real Chrome against the real backend (+ real Gemini for flashcards and photo notes).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Settings (environment variables): FRONT and API are the running frontend and backend; CHROME is Chrome's path;
// OUT is where screenshots go. Use a throwaway backend (its own DB_PATH): these flows add notes and answers.
const FRONT = process.env.FRONT || 'http://localhost:3000';
const API = process.env.API || 'http://localhost:5002';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.env.OUT || path.join(here, 'out');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const axeSource = fs.readFileSync(path.join(here, 'node_modules/axe-core/axe.min.js'), 'utf8');
const results = {};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`${FRONT}/?api=${API}`, { waitUntil: 'networkidle0' });

async function axe(label) {
  await page.addScriptTag({ content: axeSource });
  const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] }))
    .violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0]?.target}`));
  results[`axe ${label}`] = v;
}

// 1. onboarding
await page.waitForSelector('#onboarding[open]');
await axe('onboarding');
await page.evaluate(() => [...document.querySelectorAll('.onb-choice')].find((b) => b.innerText.startsWith('English')).click());
results.langAfterChoice = await page.$eval('#lang', (n) => n.value);
await page.evaluate(() => [...document.querySelectorAll('#onboarding .btn-primary')].find((b) => /Next/.test(b.innerText)).click());
await page.evaluate(() => ([...document.querySelectorAll('#onboarding .btn')].find((b) => /demo/.test(b.innerText))
  ?? document.getElementById('btnDemo')).click());   // a database that already has notes shows no demo button in the guide
await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => /Demo notes loaded/.test(t.textContent)), { timeout: 60000 });
await wait(600);
results.step2 = await page.$eval('#onboarding', (n) => n.innerText.slice(0, 120));
await page.evaluate(() => [...document.querySelectorAll('#onboarding .btn-primary')].find((b) => /Next/.test(b.innerText)).click());
await shot(page, 'p-onb-step3');
await page.evaluate(() => [...document.querySelectorAll('#onboarding .btn')].find((b) => /Later/.test(b.innerText)).click());
results.dialogClosed = await page.$eval('#onboarding', (n) => !n.open);
results.onboardedSaved = await page.evaluate(() => localStorage.getItem('eklavya.onboarded'));

// 2. today
await page.waitForFunction(() => document.querySelector('.plan-item'), { timeout: 15000 });
results.today = await page.$eval('#today', (n) => n.innerText.slice(0, 400));
await shot(page, 'p-today');

// 3. planner
const exam = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
await page.$eval('#exam-date', (n, v) => { n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); }, exam);
await page.select('#exam-minutes', '30');
await page.evaluate(() => document.querySelector('.planner-form button[type="submit"]').click());
await page.waitForFunction(() => document.querySelectorAll('.plan-day').length >= 7, { timeout: 15000 });
results.plannerDays = await page.$$eval('.plan-day', (rows) => rows.slice(0, 3).map((r) => r.innerText.replace(/\n/g, ' | ')));
results.examChip = await page.$eval('.today-chips', (n) => n.innerText);
await shot(page, 'p-planner', { fullPage: true });
await axe('today');

// 4. Hindi labels
await page.select('#lang', 'hindi');
await wait(300);
results.hindi = await page.evaluate(() => ({ tabs: [...document.querySelectorAll('.tab')].map((t) => t.innerText.trim()), greeting: document.querySelector('.today-greeting').innerText, htmlLang: document.documentElement.lang }));
await shot(page, 'p-today-hindi');
await page.select('#lang', 'english');

// 5. progress: concept map, flashcards (real Gemini), study pack button
await page.click('#tab-progress');
await page.waitForSelector('.map-svg');
results.map = await page.evaluate(() => ({ nodes: document.querySelectorAll('.map-node').length, links: document.querySelectorAll('.map-link').length, list: document.querySelector('.map-list').innerText.split('\n').slice(0, 4) }));
await page.evaluate(() => [...document.querySelectorAll('.flashcards .btn')].find((b) => /Make cards/.test(b.innerText)).click());
await page.waitForSelector('.flashcard', { timeout: 90000 });
results.cardFront = await page.$eval('.flashcard', (n) => n.innerText);
await page.click('.flashcard');
results.cardBack = await page.$eval('.flashcard', (n) => n.innerText);
await page.keyboard.press('ArrowRight');
results.cardCount = await page.$eval('.cards-nav .hint', (n) => n.innerText);
results.focusAfterArrow = await page.evaluate(() => document.activeElement?.className);
results.packButton = await page.$eval('#btnPack', (n) => n.innerText);
await shot(page, 'p-progress', { fullPage: true });
await axe('progress');

// 6. photo of notes -> upload (Gemini reads it)
const notesPage = await browser.newPage();
await notesPage.setViewport({ width: 900, height: 700 });
await notesPage.setContent(`<body style="font:22px Georgia;padding:40px;background:#fffef6">
  <h2>Bayes Theorem</h2><p>P(A|B) = P(B|A) x P(A) / P(B)</p>
  <p>It updates a belief after seeing evidence. Example: a medical test is 99% accurate but the disease is rare (1 in 1000),
  so a positive test still means only about a 9% chance of having the disease.</p>
  <h2>Prior and Posterior</h2><p>The prior is the belief before evidence; the posterior is the belief after it.</p></body>`);
const photoPath = path.join(OUT, 'notes-photo.png');
await notesPage.screenshot({ path: photoPath });
await notesPage.close();
const input = await page.$('#file');
await input.uploadFile(photoPath);
await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => /Found \d+ topics in notes-photo.png/.test(t.textContent)), { timeout: 120000 })
  .then(() => { results.photoUpload = 'ok'; }).catch(() => { results.photoUpload = 'timeout'; });
results.photoToast = await page.$$eval('.toast', (ts) => ts.map((t) => t.textContent));
results.libraryDocs = await page.$$eval('.doc-title, .doc-name', (n) => n.map((x) => x.textContent));
results.uploadButtonAfter = await page.$eval('#btnUpload', (n) => n.innerHTML.includes('svg') && n.innerText);

// 7. phone
await page.setViewport({ width: 390, height: 844 });
await page.click('#tab-today');
await wait(400);
await shot(page, 'p-phone-today', { fullPage: true });
results.phoneScroll = await page.evaluate(() => document.documentElement.scrollWidth);
await axe('phone today');
await page.click('#tab-progress');
await wait(400);
await shot(page, 'p-phone-progress', { fullPage: true });
await axe('phone progress');

console.log(JSON.stringify(results, null, 1));
console.log('errors:', JSON.stringify(errors));
await browser.close();
