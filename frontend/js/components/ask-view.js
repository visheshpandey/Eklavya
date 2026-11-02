// Ask, from the new design: type a question, get an answer from your notes together with the exact passages it came from, the question's words
// highlighted, how well the notes match ("Strong match", "Partial match" or "Not in your notes") and how many passages were searched.
// Ctrl+Enter sends. Every question is saved as a doubt: the list below can be searched and deleted, and recent doubts can be asked again.
// Data comes through the callbacks (ask, listDoubts, deleteDoubt); this file only draws.
import { el, render } from '../lib/dom.js';
import { bestSentences, splitByTerms } from '../lib/highlight.js';
import { coverLetters, groupSubjects } from '../lib/subjects.js';
import { renderMarkdown } from '../lib/markdown.js';
import { icon } from '../lib/icons.js';

const KIND_ICON = { pdf: 'file-pdf', text: 'file-text', photo: 'image', link: 'globe', youtube: 'youtube-logo' };

const when = (stamp) => {
  const date = new Date(`${String(stamp).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const MATCH = { strong: ['Strong match', ''], partial: ['Partial match', ' partial'], none: ['Not in your notes', ' partial'] };

export function mountAsk({ chatRoot, listRoot, sourcesRoot, recentRoot, recentWrap, onAsk, onList, onDelete, onClear, topics, subjects, sound, onListen }) {
  const thread = [];   // this visit's questions and answers, newest first
  let busy = false;
  let query = '';
  let doubts = { doubts: [], total: 0 };
  let timer = null;
  let draft = '';
  let error = '';

  /** A cited passage: its markdown is drawn (no "###" or "**" on screen) with the question's words highlighted. */
  function highlighted(text, terms) {
    const paragraph = el('p', { class: 'md-passage' });
    paragraph.append(renderMarkdown(text, { terms, inline: true }));
    return paragraph;
  }

  function answerCard(item) {
    if (item.pending) return el('div', { class: 'answer' }, el('p', { class: 'mono', text: item.question }), el('p', { class: 'ask-wait', role: 'status', text: 'Looking in your notes…' }));
    if (item.error) return el('div', { class: 'answer' }, el('p', { class: 'mono', text: item.question }), el('p', { class: 'auth-error', role: 'alert', text: item.error }));
    const [word, tone] = MATCH[item.match] ?? MATCH.partial;
    return el('div', { class: 'answer' },
      el('div', { class: 'ahead' }, el('span', { class: `strength${tone}`, text: word }),
        el('span', { class: 'mono', text: `Searched ${item.searched ?? 0} passage${item.searched === 1 ? '' : 's'} in ${item.ms ?? 0} ms` })),
      el('p', { class: 'mono', text: item.question }),
      el('div', { class: 'md' }, renderMarkdown(item.answer)),
      item.follow_up_question ? el('button', { class: 'chip-action', type: 'button', onclick: () => fill(item.follow_up_question) }, item.follow_up_question) : null,
      ...(item.sources ?? []).map((source) => el('div', { class: 'passage' }, highlighted(bestSentences(source.text, item.terms, 3), item.terms),
        el('span', { class: 'mono', text: `${source.document} · ${source.heading || source.topic}` }))),
      sound.isOn() ? el('button', { class: 'linkbtn', type: 'button', onclick: () => onListen(item.answer) }, 'Listen ↗') : null);
  }

  function exampleChips() {
    const names = topics().slice(0, 3);
    const examples = names.length ? names.map((name) => [`Explain ${name}`, `Explain ${name} in simple words.`])
      : [['Explain a topic', 'Explain this topic in simple words.']];
    return [...examples, ['In Hinglish', 'Isko simple words mein samjhao.'], ['What should I revise?', 'What should I revise first?']];
  }

  function drawChat() {
    const input = el('textarea', { id: 'ask-input', placeholder: 'Ask something from your notes…', 'aria-label': 'Your question', maxlength: '2000', disabled: busy ? '' : null });
    input.value = draft;
    input.addEventListener('input', () => { draft = input.value; if (error) { error = ''; chatRoot.querySelector('.err').textContent = ''; } });
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) form.requestSubmit(); });
    const form = el('form', { class: 'askbox', id: 'askForm' }, input,
      el('div', { class: 'cbot' }, el('small', { text: 'Answers come only from your library. Ctrl+Enter to send.' }),
        el('button', { class: 'btn btn-primary', type: 'submit', disabled: busy ? '' : null }, busy ? 'Asking…' : 'Ask ↗')));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const question = input.value.trim();
      if (!question) { error = 'Enter a question first.'; chatRoot.querySelector('.err').textContent = error; input.focus(); return; }
      if (busy) return;
      run(question);
    });
    render(chatRoot,
      el('div', { class: 'askcard' }, el('span', { class: 'mono', text: 'English or Hinglish' }),
        el('h2', {}, 'What are you trying', el('br'), 'to understand?'),
        el('p', { text: 'Eklavya searches your notes and shows the exact passages it used.' }),
        el('div', { class: 'chips' }, exampleChips().map(([label, text]) => el('button', { type: 'button', onclick: () => fill(text) }, label)))),
      form,
      el('p', { class: 'err', role: 'alert', text: error }),
      el('div', { id: 'answer', 'aria-live': 'polite' }, thread.map(answerCard)));
  }

  async function run(question) {
    busy = true;
    draft = '';
    const entry = { question, pending: true };
    thread.unshift(entry);
    drawChat();
    try { Object.assign(entry, await onAsk(question), { pending: false }); }
    catch (failure) { Object.assign(entry, { pending: false, error: failure.message }); }
    busy = false;
    drawChat();
    loadList();
    chatRoot.querySelector('#ask-input')?.focus();
  }

  function fill(text) {
    draft = text;
    const input = chatRoot.querySelector('#ask-input');
    if (!input) return;
    input.value = text;
    input.focus();
  }

  function drawSide() {
    const all = groupSubjects(subjects());
    const subs = all.slice(0, 6);   // the longest lists are cut: the notes page has them all
    render(sourcesRoot, subs.length ? [...subs.map((s) => el('div', { class: 'src' }, el('span', { class: 'srcbadge', title: s.kind }, icon(KIND_ICON[s.kind] ?? 'file-text', { size: 18 })),
      el('span', {}, el('b', { text: s.name }), el('small', { text: `${s.topics} topic${s.topics === 1 ? '' : 's'}` })))),
      all.length > subs.length ? el('p', { class: 'hint', text: `and ${all.length - subs.length} more in My notes` }) : null]
      : el('p', { class: 'hint', text: 'Add notes and they are listed here.' }));
    const latest = [...new Set(doubts.doubts.map((d) => d.question))].slice(0, 5);
    recentWrap.hidden = !latest.length;
    render(recentRoot, latest.map((q) => el('button', { type: 'button', onclick: () => { fill(q); run(q); } }, q)));
  }

  function drawList() {
    const search = el('input', { id: 'doubt-search', class: 'field', type: 'search', value: query, autocomplete: 'off', placeholder: 'Search your doubts' });
    search.addEventListener('input', () => { query = search.value; clearTimeout(timer); timer = setTimeout(loadList, 250); });
    const rows = doubts.doubts.map((d) => el('details', { class: 'doubt' },
      el('summary', {}, el('span', { class: 'doubt-q', text: d.question }), el('span', { class: 'hint', text: when(d.created_at) })),
      el('div', { class: 'md' }, renderMarkdown(d.answer)),
      d.topic && d.grounded ? el('span', { class: 'meta-chip', text: d.topic }) : null,
      el('button', { class: 'btn btn-danger-quiet btn-sm', type: 'button', 'aria-label': `Delete the doubt: ${d.question}`,
        onclick: async () => { await onDelete(d.id); loadList(); } }, 'Delete')));
    render(listRoot,
      doubts.total ? search : null,
      rows.length ? el('div', { class: 'list' }, rows)
        : el('p', { class: 'empty', text: doubts.total ? `No doubts match "${query}".` : 'Nothing yet. Ask your first question above.' }),
      doubts.total ? el('button', { class: 'btn btn-quiet btn-sm', type: 'button',
        onclick: async () => { if (globalThis.confirm('Delete all your saved doubts?')) { await onClear(); loadList(); } } }, 'Delete all doubts') : null);
    if (query) listRoot.querySelector('#doubt-search')?.setSelectionRange(query.length, query.length);
  }

  async function loadList() {
    try { doubts = await onList(query); } catch { /* keeps the last list */ }
    const hadFocus = document.activeElement?.id === 'doubt-search';
    drawList();
    drawSide();
    if (hadFocus) listRoot.querySelector('#doubt-search')?.focus();
  }

  drawChat();
  drawList();
  drawSide();
  return {
    refresh: () => { loadList(); drawChat(); },
    /** Open the screen's question box with a ready question and send it (used by "Ask about it" on the concept map). */
    askNow(question) { run(question); },
    redrawSide: drawSide,
  };
}
