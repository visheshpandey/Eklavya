// The owner's student list: asks for the admin key, fetches /api/admin/students and draws a searchable table.
// The key lives in sessionStorage only (gone when the tab closes) and is sent in a header, never in the address. Everything is drawn with textContent.
import { API_BASE } from './lib/config.js';
import { filterStudents, byRecent, totalActions, seen, joined, doneText } from './lib/admin-view.js';

const $ = (id) => document.getElementById(id);
const KEY = 'eklavya.adminKey';
let students = [];

const store = {
  get() { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } },
  set(value) { try { value ? sessionStorage.setItem(KEY, value) : sessionStorage.removeItem(KEY); } catch { /* private mode: the key just is not remembered */ } },
};

function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function row(s, nowMs) {
  const tr = document.createElement('tr');
  const name = cell(s.name || '(no name)', 'ad-name');
  tr.append(name, cell(s.email, 'ad-mono'), cell(s.sign_in.join(' + ') || '–'), cell(joined(s.joined)), cell(seen(s.last_active, nowMs)),
    cell(totalActions(s.activity) ? doneText(s.activity) : 'nothing yet'),
    cell(`${s.language || '–'} · ${s.daily_minutes || '–'} min/day${s.exam_date ? ` · exam ${s.exam_date}` : ''}`));
  return tr;
}

function draw() {
  const shown = byRecent(filterStudents(students, $('ad-search').value));
  const now = Date.now();
  $('ad-body').replaceChildren(...(shown.length ? shown.map((s) => row(s, now)) : [Object.assign(document.createElement('tr'), {})]));
  if (!shown.length) {
    const td = cell(students.length ? 'No one matches that search.' : 'No one has signed up yet.', 'ad-empty');
    td.colSpan = 7;
    $('ad-body').firstChild.append(td);
  }
  const count = $('ad-count');
  count.hidden = false;
  count.textContent = `${students.length} signed up`;
}

function fail(message) {
  const box = $('ad-error');
  box.textContent = message;
  box.hidden = false;
}

async function load(key) {
  $('ad-error').hidden = true;
  let res;
  try {
    res = await fetch(`${API_BASE}/api/admin/students`, { headers: { 'X-Admin-Key': key }, cache: 'no-store' });
  } catch {
    return fail('Could not reach the server. It may be waking up: try again in a few seconds.');
  }
  if (res.status === 401) { store.set(''); return fail('That key is not right.'); }
  if (res.status === 429) return fail('Too many wrong keys. Wait a minute and try again.');
  if (res.status === 404) return fail('The student list is switched off on this server (no ADMIN_KEY is set).');
  if (!res.ok) return fail('Something went wrong. Try again.');
  students = (await res.json()).students;
  store.set(key);
  $('ad-gate').hidden = true;
  $('ad-list-card').hidden = false;
  draw();
}

$('ad-gate').addEventListener('submit', (event) => { event.preventDefault(); load($('ad-key').value.trim()); });
$('ad-search').addEventListener('input', draw);
$('ad-refresh').addEventListener('click', () => load(store.get()));
$('ad-export').addEventListener('click', async () => {
  const button = $('ad-export');
  button.disabled = true;
  button.textContent = 'Preparing…';
  try {
    const res = await fetch(`${API_BASE}/api/admin/export`, { headers: { 'X-Admin-Key': store.get() }, cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await res.blob()), download: `eklavya-data-${new Date().toISOString().slice(0, 10)}.json` });
    link.click();
    URL.revokeObjectURL(link.href);
  } catch {
    fail('The download failed. Try again.');
  }
  button.disabled = false;
  button.textContent = 'Download all data';
});
$('ad-lock').addEventListener('click', () => {
  store.set('');
  students = [];
  $('ad-key').value = '';
  $('ad-list-card').hidden = true;
  $('ad-count').hidden = true;
  $('ad-gate').hidden = false;
});

if (store.get()) load(store.get());
