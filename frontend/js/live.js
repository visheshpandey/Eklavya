// The live dashboard page: asks /api/live every few seconds and draws the numbers, the 30-minute chart and the feed.
// Everything is written with textContent, so nothing the server sends can become markup.
import { API_BASE } from './lib/config.js';
import { totalRows, feedItems, barHeights, statusText, REFRESH_MS } from './lib/live-view.js';

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function draw(snap) {
  $('lv-active').textContent = snap.active_now;
  $('lv-today').textContent = snap.today;
  $('lv-voice').textContent = snap.voice_minutes;
  $('lv-ms').textContent = snap.ask.average_ms ? `${(snap.ask.average_ms / 1000).toFixed(1)}s` : '–';

  const bars = $('lv-bars');
  bars.replaceChildren(...barHeights(snap.activity).map((pct, i) => {
    const bar = el('span', pct ? 'lv-bar' : 'lv-bar quiet');
    bar.style.height = `${pct}%`;
    bar.title = `${snap.activity[i]} actions`;
    return bar;
  }));

  const feed = $('lv-feed');
  const items = feedItems(snap.feed, Date.parse(`${snap.as_of.replace(' ', 'T')}Z`));
  feed.replaceChildren(...(items.length ? items.map((item) => {
    const row = el('li', `lv-item k-${item.kind}`);
    row.append(el('span', 'lv-who', item.who), el('span', 'lv-what', item.what), el('span', 'lv-when', item.when));
    return row;
  }) : [el('li', 'lv-empty', 'Quiet right now. Activity shows up here as it happens.')]));

  $('lv-totals').replaceChildren(...totalRows(snap.totals).flatMap(([label, value]) => [el('dt', '', label), el('dd', '', String(value))]));
}

function setStatus(ok, when) {
  $('lv-status').dataset.ok = ok ? 'yes' : 'no';
  $('lv-status-text').textContent = statusText(ok, when);
}

async function tick() {
  try {
    const res = await fetch(`${API_BASE}/api/live`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const snap = await res.json();
    draw(snap);
    setStatus(true, new Date());
  } catch {
    setStatus(false);   // the free server may be waking up: keep the last numbers and try again
  }
}

tick();
setInterval(() => { if (!document.hidden) tick(); }, REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
