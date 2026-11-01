// Challenge a friend: pick a topic to get a code, or enter a friend's code and answer the same 5 questions.
// One try each. The standings show once you have played.
import { el, render } from '../lib/dom.js';

export function mountChallenge({ root, api, signedIn, topics, onSignIn, notify, onPlayed = () => {} }) {
  let page = null;        // an opened challenge: questions to play, or standings
  let mine = [];
  let answers = {};
  let startedAt = 0;
  let message = '';
  let busy = false;

  async function run(task) {
    busy = true; message = ''; draw();
    try { await task(); } catch (error) { message = error.message; }
    busy = false; draw();
  }

  async function show(code) {
    const opened = await api.openChallenge(code);
    if (opened.played) page = { ...(await api.challengeResult(code)), code: opened.code };
    else { page = opened; answers = {}; startedAt = Date.now(); }
  }

  async function load() {
    if (!signedIn()) { draw(); return; }
    try { mine = (await api.challenges()).challenges; } catch { /* the form still works */ }
    draw();
  }

  function startForms() {
    const options = topics();
    const pick = el('select', { id: 'challenge-topic', class: 'select' }, options.map((t) => el('option', { value: t.topic_id }, t.topic_name)));
    const code = el('input', { id: 'challenge-code', class: 'field code-field', type: 'text', maxlength: '12', required: '', autocomplete: 'off', placeholder: 'Friend\'s code' });
    const make = options.length ? el('form', { class: 'link-form' }, el('label', { class: 'visually-hidden', for: 'challenge-topic', text: 'Topic for the challenge' }), pick,
      el('button', { class: 'btn btn-primary', type: 'submit', disabled: busy ? '' : null }, busy ? 'Preparing…' : 'Challenge a friend'))
      : el('p', { class: 'hint', text: 'Add notes to create a challenge, or enter a friend\'s code.' });
    const join = el('form', { class: 'link-form' }, el('label', { class: 'visually-hidden', for: 'challenge-code', text: 'Challenge code' }), code,
      el('button', { class: 'btn btn-secondary', type: 'submit', disabled: busy ? '' : null }, 'Play a friend\'s challenge'));
    make.addEventListener?.('submit', (e) => { e.preventDefault(); run(async () => { page = await api.createChallenge(Number(pick.value)); mine = (await api.challenges()).challenges; }); });
    join.addEventListener('submit', (e) => { e.preventDefault(); run(() => show(code.value)); });
    return [make, join,
      mine.length ? el('ul', { class: 'list' }, mine.map((c) => el('li', { class: 'shared-note' },
        el('span', {}, el('strong', { text: c.topic }), el('span', { class: 'hint', text: ` ${c.players} played` })),
        el('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: () => run(() => show(c.code)) }, `Open ${c.code}`)))) : null];
  }

  function playNode() {
    const answered = Object.keys(answers).length;
    const form = el('form', { class: 'challenge-play' },
      page.questions.map((q) => el('fieldset', { class: 'challenge-q' }, el('legend', { text: `${q.position}. ${q.question}` }),
        q.options.map((text) => {
          const letter = text.trim()[0];
          return el('label', { class: 'choice' },
            el('input', { type: 'radio', name: `q${q.position}`, value: letter, checked: answers[q.position] === letter ? '' : null,
              onchange: () => { answers[q.position] = letter; } }), ` ${text}`);
        }))),
      el('button', { class: 'btn btn-primary btn-lg', type: 'submit', disabled: busy ? '' : null }, 'Submit my answers'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      run(async () => {
        const seconds = Math.round((Date.now() - startedAt) / 1000);
        page = await api.playChallenge(page.code, answers, seconds);
        mine = (await api.challenges()).challenges;
        onPlayed();
      });
    });
    return [el('p', { class: 'hint', text: `${page.topic}: ${page.total} questions, one try. ${answered} answered.` }), form];
  }

  function resultNode() {
    return [
      el('div', { class: 'group-code-row' }, el('span', { class: 'hint', text: `${page.topic}. Send this code to a friend` }),
        el('strong', { class: 'group-code', text: page.code }),
        el('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: async () => {
          try { await navigator.clipboard.writeText(page.code); notify('Code copied.'); } catch { notify(`The code is ${page.code}`); } } }, 'Copy')),
      page.played ? el('ol', { class: 'leaderboard' }, page.standings.map((r) => el('li', { class: r.you ? 'is-you' : '' },
        el('span', { class: 'lb-rank', text: String(r.rank) }), el('span', { class: 'lb-name', text: r.you ? `${r.name} (you)` : r.name }),
        el('span', { class: 'hint', text: `${r.seconds}s` }), el('strong', { text: `${r.correct}/${r.total}` }))))
        : el('div', {}, el('p', { text: 'Play your own challenge to see how friends do.' }),
          el('button', { class: 'btn btn-primary', type: 'button', onclick: () => run(() => show(page.code)) }, 'Play it now')),
      page.review ? el('details', { class: 'doubt' }, el('summary', {}, 'See the answers'),
        page.review.map((r) => el('p', { class: 'hint', text: `${r.position}. ${r.question} Correct: ${r.correct}` }))) : null];
  }

  function draw() {
    if (!signedIn()) {
      render(root, el('p', { class: 'hint', text: 'Sign in to challenge friends.' }),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: onSignIn }, 'Sign in or create an account'));
      return;
    }
    const playing = page && !page.played && page.questions;
    render(root,
      el('p', { class: 'auth-error', role: 'alert', text: message, hidden: message ? null : '' }),
      page ? el('button', { class: 'link-btn', type: 'button', onclick: () => { page = null; draw(); } }, 'Back to challenges') : null,
      ...(playing ? playNode() : page ? resultNode() : [el('p', { class: 'hint', text: 'Five questions on one topic. Send the code, and the best score wins.' }), ...startForms()]));
  }

  load();
  return { refresh: load };
}
