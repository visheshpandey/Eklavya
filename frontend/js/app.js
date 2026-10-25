// Wires the page together: topic picker + voice session <-> UI. Everything the tutor says or decides arrives as server events.
import { api } from './api.js';
import { el, $ } from './dom.js';
import { VoiceClient } from './voice.js';
import { getLanguage } from './language.js';
import { showEmotion } from './emotion.js';
import { showQuestion, showResult } from './quiz.js';
import { showMission } from './mission.js';
import { refreshDashboard, handlers, markSelected } from './dashboard.js';

const STATUS = {
  idle: 'Tap to talk to Eklavya',
  connecting: 'Connecting…',
  listening: 'Listening… just talk',
  speaking: 'Eklavya is speaking. Talk to interrupt.',
};
const cur = { user: null, tutor: null };   // bubble being filled by live transcript chunks
let busy = false;
let selectedTopic = null;

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

function showPhase(ev) {
  const label = { teaching: 'Learning', test: 'Voice test', summary: 'Summary' }[ev.phase] || ev.phase;
  $('phase').replaceChildren(el('span', { class: 'step', text: label }), el('span', { text: ev.topic }));
  $('phase').hidden = false;
}

function showSummary(s) {
  const delta = Math.round((s.mastery_after - s.mastery_before) * 10) / 10;
  $('summary').replaceChildren(
    el('div', { class: 'card-title' }, el('span', { text: 'Test complete' }), el('span', { class: 'pill', text: s.topic })),
    el('p', { class: 'score', text: s.correct + ' / ' + s.total + ' correct' }),
    el('p', { text: 'Mastery ' + s.mastery_before + '% → ' + s.mastery_after + '% (' + (delta > 0 ? '+' : '') + delta + ')' }),
    s.misconceptions.length ? el('div', {}, el('p', { text: 'Mistakes to fix:' }),
      el('ul', {}, s.misconceptions.map((m) => el('li', { text: m })))) : null,
    s.resolved ? el('p', { class: 'resolved', text: s.resolved + ' misconception(s) resolved' }) : null,
  );
  $('summary').hidden = false;
}

const voice = new VoiceClient({
  onState(state) {
    $('orb').dataset.state = state;
    $('status').textContent = STATUS[state];
    $('orb').setAttribute('aria-label', state === 'idle' ? 'Start voice session' : 'End voice session');
    $('textin').disabled = state === 'idle' || state === 'connecting';
    $('textsend').disabled = $('textin').disabled;
    if (state === 'idle') $('phase').hidden = true;
  },
  onEvent(ev) {
    switch (ev.type) {
      case 'transcript': onTranscript(ev); break;
      case 'emotion': showEmotion(ev); break;
      case 'phase': showPhase(ev); break;
      case 'quiz_question': $('summary').hidden = true; showQuestion(ev, (letter) => voice.sendText(letter)); break;
      case 'test_summary': showSummary(ev); break;
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

function resetSession() {
  $('chat').replaceChildren(el('p', { class: 'chat-empty' }, 'Say anything, or pick a topic on the right to learn it.'));
  $('chat').classList.remove('has-msgs');
  ['emotion', 'quizcard', 'summary', 'phase'].forEach((id) => { $(id).hidden = true; });
  cur.user = cur.tutor = null;
}

async function startSession(mode = 'free', topicId = null) {
  if (voice.state !== 'idle') voice.stop();
  resetSession();
  showBanner('');
  try { await voice.start({ userId: 1, lang: getLanguage(), mode, topicId }); }
  catch (e) { showBanner(e.message); }
}

// ----- topic picker: show what the notes say about the topic, then learn or be tested
async function openTopic(id) {
  selectedTopic = id;
  markSelected(id);
  let t;
  try { t = await api('/api/topics/' + id + '?user_id=1'); }
  catch (e) { showBanner(e.message); return; }
  const mastery = Math.round(t.mastery);
  $('topic').replaceChildren(
    el('div', { class: 'card-title' }, el('span', { text: 'Selected topic' }), el('span', { class: 'pill', text: 'Mastery ' + mastery + '%' })),
    el('h3', { text: t.topic_name }),
    el('p', { class: 'meta', text: t.question_count + ' practice question(s) ready' }),
    el('div', { class: 'notes' }, t.notes.length
      ? t.notes.map((n) => el('div', {}, n.heading ? el('strong', { text: n.heading }) : null, el('span', { text: n.text })))
      : [el('span', { text: 'No notes were matched to this topic.' })]),
    t.open_misconceptions.length
      ? el('p', { class: 'warn', text: 'To fix: ' + t.open_misconceptions[0].misconception_text }) : null,
    el('div', { class: 'actions' },
      el('button', { class: 'btn', type: 'button', onclick: () => startSession('learn', id) }, 'Teach me this, then test me (voice)'),
      el('button', { class: 'btn ghost', type: 'button', onclick: () => startSession('test', id) }, 'Just test me (voice)')),
  );
  $('topic').hidden = false;
  $('topic').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
handlers.topic = openTopic;

async function withBusy(btn, label, fn) {
  if (busy) return;
  busy = true;
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = label;
  try { await fn(); }
  catch (e) { showBanner(e.message); toast(e.message, 'bad'); }
  finally { busy = false; btn.disabled = false; btn.textContent = old; }
}

$('orb').addEventListener('click', () => (voice.state !== 'idle' ? voice.stop() : startSession('free')));

$('textform').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('textin').value.trim();
  if (v) { voice.sendText(v); $('textin').value = ''; }
});

function afterNotesChange() {
  resetSession(); showBanner('');
  $('topic').hidden = true; selectedTopic = null; markSelected(null);
}

$('btnDemo').addEventListener('click', () => withBusy($('btnDemo'), 'Loading…', async () => {
  if (voice.state !== 'idle') voice.stop();
  await api('/api/demo/seed', { method: 'POST' });
  afterNotesChange();
  $('mission').hidden = true;
  await refreshDashboard();
  toast('Demo notes loaded. Tap a topic to start learning.');
}));

$('file').addEventListener('change', () => {
  const f = $('file').files[0];
  if (!f) return;
  withBusy($('btnUpload'), 'Reading notes…', async () => {
    if (voice.state !== 'idle') voice.stop();
    const form = new FormData();
    form.append('user_id', '1'); form.append('file', f);
    const r = await api('/api/upload-document', { method: 'POST', form });
    afterNotesChange();
    $('mission').hidden = true;
    await refreshDashboard();
    toast('Found ' + r.topics_found.length + ' topics in ' + f.name + '. Tap one to start.');
  }).finally(() => { $('file').value = ''; });
});

$('btnUpload').addEventListener('click', () => $('file').click());

refreshDashboard().catch((e) => showBanner(e.message));
