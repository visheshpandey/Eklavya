// Wires the page together: voice session <-> UI. Everything the tutor says or decides arrives as server events.
import { api } from './api.js';
import { el, $ } from './dom.js';
import { VoiceClient } from './voice.js';
import { getLanguage } from './language.js';
import { showEmotion } from './emotion.js';
import { showQuestion, showResult } from './quiz.js';
import { showMission } from './mission.js';
import { refreshDashboard } from './dashboard.js';

const STATUS = {
  idle: 'Tap to talk to Eklavya',
  connecting: 'Connecting…',
  listening: 'Listening… just talk',
  speaking: 'Eklavya is speaking. Talk to interrupt.',
};
const cur = { user: null, tutor: null };   // bubble being filled by live transcript chunks
let busy = false;

function toast(msg, kind = '') {
  const t = el('div', { class: 'toast ' + kind, text: msg });
  $('toasts').append(t);
  setTimeout(() => t.remove(), 6000);
}

function bubble(role, text = '') {
  const b = el('div', { class: 'msg ' + role },
    el('span', { class: 'who', text: role === 'user' ? 'You' : 'Eklavya' }),
    el('p', { text }));
  $('chat').append(b);
  $('chat').scrollTop = $('chat').scrollHeight;
  $('chat').classList.add('has-msgs');
  return b;
}

function onTranscript(ev) {
  const role = ev.role === 'user' ? 'user' : 'tutor';
  if (!ev.final) {
    cur[role] = cur[role] || bubble(role);
    cur[role].querySelector('p').textContent += ev.text;
  } else {
    const b = cur[role] || bubble(role);
    b.querySelector('p').textContent = ev.text;
    cur[role] = null;
  }
  $('chat').scrollTop = $('chat').scrollHeight;
}

const voice = new VoiceClient({
  onState(state) {
    $('orb').dataset.state = state;
    $('status').textContent = STATUS[state];
    $('orb').setAttribute('aria-label', state === 'idle' ? 'Start voice session' : 'End voice session');
    $('textin').disabled = state === 'idle' || state === 'connecting';
    $('textsend').disabled = $('textin').disabled;
  },
  onEvent(ev) {
    switch (ev.type) {
      case 'transcript': onTranscript(ev); break;
      case 'emotion': showEmotion(ev); break;
      case 'quiz_question': showQuestion(ev, (letter) => voice.sendText(letter)); break;
      case 'mastery':
        showResult(ev);
        toast(ev.topic + ': ' + ev.before + '% → ' + ev.after + '%', ev.is_correct ? 'ok' : 'bad');
        refreshDashboard().catch(() => {});
        break;
      case 'mission': showMission(ev); refreshDashboard().catch(() => {}); break;
      case 'interrupted': if (cur.tutor) { cur.tutor.classList.add('cut'); cur.tutor = null; } break;
      case 'turn_complete': refreshDashboard().catch(() => {}); break;
      case 'error': toast(ev.message, 'bad'); showBanner(ev.message); voice.stop(); break;
      default: break;
    }
  },
});

function showBanner(msg) {
  $('banner').textContent = msg;
  $('banner').hidden = !msg;
}

async function toggleTalk() {
  if (voice.state !== 'idle') { voice.stop(); return; }
  showBanner('');
  try { await voice.start({ userId: 1, lang: getLanguage() }); }
  catch (e) { showBanner(e.message); }
}

function resetSession() {
  $('chat').replaceChildren();
  $('chat').classList.remove('has-msgs');
  ['emotion', 'quizcard', 'mission'].forEach((id) => { $(id).hidden = true; });
  cur.user = cur.tutor = null;
}

async function withBusy(btn, label, fn) {
  if (busy) return;
  busy = true;
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = label;
  try { await fn(); }
  catch (e) { showBanner(e.message); toast(e.message, 'bad'); }
  finally { busy = false; btn.disabled = false; btn.textContent = old; }
}

$('orb').addEventListener('click', toggleTalk);

$('textform').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('textin').value.trim();
  if (v) { voice.sendText(v); $('textin').value = ''; }
});

$('btnDemo').addEventListener('click', () => withBusy($('btnDemo'), 'Loading…', async () => {
  if (voice.state !== 'idle') voice.stop();
  await api('/api/demo/seed', { method: 'POST' });
  resetSession(); showBanner('');
  await refreshDashboard();
  toast('Demo notes loaded. Precision starts at 38%.');
}));

$('file').addEventListener('change', () => {
  const f = $('file').files[0];
  if (!f) return;
  withBusy($('btnUpload'), 'Reading notes…', async () => {
    const form = new FormData();
    form.append('user_id', '1'); form.append('file', f);
    const r = await api('/api/upload-document', { method: 'POST', form });
    resetSession(); showBanner('');
    await refreshDashboard();
    toast('Found ' + r.topics_found.length + ' topics in ' + f.name);
  }).finally(() => { $('file').value = ''; });
});

$('btnUpload').addEventListener('click', () => $('file').click());

refreshDashboard().catch((e) => showBanner(e.message));
