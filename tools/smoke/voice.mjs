// Voice modes in real Chrome (fake mic) against real Gemini Live: viva, debate scoreboard, quick revision, photo in a call.
// The student's turns are typed into the composer (the same Gemini session receives them).
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
const only = process.argv[2];   // run one mode: viva | debate | revise | photo
const results = {};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--no-first-run'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.setViewport({ width: 1280, height: 1000 });
await page.evaluateOnNewDocument(() => localStorage.setItem('eklavya.onboarded', '1'));
await page.goto(`${FRONT}/?api=${API}`, { waitUntil: 'networkidle0' });
await page.select('#lang', 'english');

async function openTopic(name) {
  await page.click('#tab-study');
  await page.waitForFunction(() => document.querySelectorAll('.topic-row').length >= 5, { timeout: 20000 });
  await page.evaluate((n) => [...document.querySelectorAll('.topic-row')].find((r) => r.textContent.includes(n)).click(), name);
  await page.waitForFunction((n) => document.querySelector('.study-title')?.textContent === n, {}, name);
}
async function say(text, ms = 12000) {
  await page.waitForFunction(() => !document.getElementById('textin').disabled, { timeout: 30000 });
  await page.type('#textin', text);
  await page.keyboard.press('Enter');
  await wait(ms);
}
const stop = async () => { await page.evaluate(() => { if (document.getElementById('orb').dataset.state !== 'idle') document.getElementById('orb').click(); }); await wait(800); };
const chat = () => page.$eval('#chat', (n) => n.innerText.slice(-700));

if (!only || only === 'viva') {
  await openTopic('Precision');
  await page.evaluate(() => [...document.querySelectorAll('.study-actions .btn')].find((b) => /Viva practice/.test(b.textContent)).click());
  await page.waitForSelector('#viva:not([hidden]) .viva-question .q-text', { timeout: 60000 }).catch(() => {});
  results.vivaQ1 = await page.$eval('#viva', (n) => n.innerText.slice(0, 200)).catch(() => 'no viva card');
  await shot(page, 'v-viva-q1');
  await say('Precision is TP divided by TP plus FP. It tells how many of the emails flagged as spam were really spam.', 15000);
  await page.waitForSelector('.viva-mark', { timeout: 45000 }).catch(() => {});
  await say('Ready for the next question.', 12000);
  results.vivaAfter = await page.$eval('#viva', (n) => n.innerText.slice(0, 300)).catch(() => 'none');
  results.vivaChat = await chat();
  await shot(page, 'v-viva-marked');
  await stop();
}

if (!only || only === 'debate') {
  await openTopic('Recall');
  await page.evaluate(() => { const d = document.querySelector('.debate'); d.open = true; });
  await page.evaluate(() => document.querySelector('.debate input[value="friendly"]').click());
  await page.evaluate(() => [...document.querySelectorAll('.debate .btn-primary')][0].click());
  await page.waitForFunction(() => !document.getElementById('debateTag').hidden, { timeout: 30000 });
  results.debateTag = await page.$eval('#debateTag', (n) => n.textContent);
  await wait(9000);
  await say('I disagree. Recall matters more in medical tests: missing one sick patient out of 100 can cost a life, while a false alarm only costs another test.', 15000);
  await page.waitForSelector('#debateScore:not([hidden])', { timeout: 30000 }).catch(() => {});
  results.debateScore = await page.$eval('#debateScore', (n) => (n.hidden ? 'hidden' : n.innerText.slice(0, 300)));
  results.debateChat = await chat();
  await shot(page, 'v-debate');
  await stop();
}

if (!only || only === 'revise') {
  await openTopic('F1 Score');
  await page.evaluate(() => [...document.querySelectorAll('.study-actions .btn')].find((b) => /Quick revision/.test(b.textContent)).click());
  await page.waitForFunction(() => !document.getElementById('stepper').hidden, { timeout: 30000 }).catch(() => {});
  results.reviseStepper = await page.$eval('#stepper', (n) => n.innerText.replace(/\n/g, ' '));
  await page.waitForSelector('#board:not([hidden])', { timeout: 45000 }).catch(() => {});
  results.reviseBoard = await page.$eval('#board', (n) => (n.hidden ? 'no board' : n.innerText.slice(0, 200)));
  await wait(6000);
  results.reviseChat = await chat();
  await shot(page, 'v-revise');
  await stop();
}

if (!only || only === 'photo') {
  const notesPage = await browser.newPage();
  await notesPage.setViewport({ width: 800, height: 500 });
  await notesPage.setContent('<body style="font:26px Georgia;padding:40px;background:#fff">Q3. A classifier flags 50 emails as spam; 40 of them are spam. 80 spam emails exist in total. Find the precision and the recall.</body>');
  const photo = path.join(OUT, 'question-photo.png');
  await notesPage.screenshot({ path: photo });
  await notesPage.close();
  await page.click('#tab-study');
  await page.click('#orb');
  await page.waitForFunction(() => ['listening', 'speaking'].includes(document.getElementById('orb').dataset.state), { timeout: 30000 });
  // wait for the greeting to finish (a tutor message, then the orb back to listening)
  await page.waitForFunction(() => document.querySelector('.msg.tutor') && document.getElementById('orb').dataset.state === 'listening', { timeout: 40000 }).catch(() => {});
  await wait(2500);
  const input = await page.$('#stageTools input[type="file"]');
  await input.uploadFile(photo);
  await page.waitForFunction(() => document.querySelector('.msg-photo'), { timeout: 15000 }).catch(() => {});
  results.photoBubble = await page.$eval('.msg.user:has(.msg-photo)', (n) => n.innerText).catch(() => 'no photo bubble');
  await wait(25000);
  results.photoChat = await chat();
  results.photoBoard = await page.$eval('#board', (n) => (n.hidden ? 'no board' : n.innerText.slice(0, 200)));
  await shot(page, 'v-photo');
  await stop();
}

const history = await (await fetch(`${API}/api/history`)).json();
results.historySaved = { vivas: history.vivas.length, debates: history.debates.length };
console.log(JSON.stringify(results, null, 1));
console.log('errors:', JSON.stringify(errors));
await browser.close();
