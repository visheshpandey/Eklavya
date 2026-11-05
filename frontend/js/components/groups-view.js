// Study groups: make one or join with a code, share notes with friends, and see this week's leaderboard.
// Needs a real account; a guest sees a sign-in prompt. Data comes through `api`, this file only draws.
import { el, render } from '../lib/dom.js';
import { leaderboardRow } from '../lib/leaderboard-row.js';

export function mountGroups({ root, api, signedIn, onSignIn, myDocuments, onNotesAdded, notify, guestRoot = null }) {
  let list = [];
  let current = null;     // the open group's detail
  let message = '';
  let busy = false;

  const say = (text) => { message = text; };
  async function run(task) {
    busy = true; message = ''; draw();
    try { await task(); } catch (error) { say(error.message); }
    busy = false; draw();
  }

  async function open(id) { current = await api.group(id); }

  async function load() {
    if (!signedIn()) { draw(); return; }
    try {
      list = (await api.groups()).groups;
      if (current && !list.some((g) => g.id === current.id)) current = null;
      if (current) await open(current.id);
    } catch (error) { say(error.message); }
    draw();
  }

  function entryForms() {
    const name = el('input', { id: 'group-name', class: 'field', type: 'text', maxlength: '60', required: '', placeholder: 'Group name, e.g. Exam squad' });
    const code = el('input', { id: 'group-code', class: 'field code-field', type: 'text', maxlength: '12', required: '', autocomplete: 'off', placeholder: 'Code from a friend' });
    const make = el('form', { class: 'link-form' }, el('label', { class: 'visually-hidden', for: 'group-name', text: 'New group name' }), name,
      el('button', { class: 'btn btn-primary', type: 'submit', disabled: busy ? '' : null }, 'Create'));
    const join = el('form', { class: 'link-form' }, el('label', { class: 'visually-hidden', for: 'group-code', text: 'Group code' }), code,
      el('button', { class: 'btn btn-secondary', type: 'submit', disabled: busy ? '' : null }, 'Join'));
    make.addEventListener('submit', (e) => { e.preventDefault(); run(async () => { current = await api.createGroup(name.value); list = (await api.groups()).groups; }); });
    join.addEventListener('submit', (e) => { e.preventDefault(); run(async () => { current = await api.joinGroup(code.value); list = (await api.groups()).groups; }); });
    return el('div', { class: 'group-forms' }, make, join);
  }

  function detailNode(group) {
    const docs = myDocuments();
    const share = docs.length ? el('form', { class: 'link-form' },
      el('label', { class: 'visually-hidden', for: 'share-doc', text: 'Notes to share' }),
      el('select', { id: 'share-doc', class: 'select' }, docs.map((d) => el('option', { value: d.id }, d.name))),
      el('button', { class: 'btn btn-secondary', type: 'submit' }, 'Share with the group')) : el('p', { class: 'hint', text: 'Upload notes to share them with the group.' });
    share.addEventListener?.('submit', (e) => {
      e.preventDefault();
      run(async () => { current = await api.shareNotes(group.id, Number(share.querySelector('select').value)); notify('Notes shared with the group.'); });
    });
    return el('div', { class: 'group-detail' },
      el('div', { class: 'group-code-row' },
        el('span', { class: 'hint', text: 'Invite friends with this code' }),
        el('strong', { class: 'group-code', text: group.code }),
        el('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: () => copy(group.code) }, 'Copy')),
      el('h4', { text: 'This week' }),
      el('ol', { class: 'leaderboard' }, group.leaderboard.map((r) => leaderboardRow(r, `${r.points} pts`))),
      el('p', { class: 'hint', text: `Points this week: ${group.points.correct} for a right answer, ${group.points.answer} for any answer, ${group.points.card} per flashcard, ${group.points.session} per voice session.` }),
      el('h4', { text: 'Shared notes' }),
      group.notes.length ? el('ul', { class: 'list' }, group.notes.map((n) => el('li', { class: 'shared-note' },
        el('span', {}, el('strong', { text: n.file_name }), el('span', { class: 'hint', text: ` ${n.topics} topics, from ${n.mine ? 'you' : n.shared_by}` })),
        !n.mine && !n.added ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button',
          onclick: () => run(async () => { await api.addSharedNotes(group.id, n.document_id); await open(group.id); notify(`${n.file_name} was added to your notes.`); onNotesAdded(); }) }, 'Add to my notes') : null,
        !n.mine && n.added ? el('span', { class: 'meta-chip', text: 'In your notes' }) : null,
        n.mine || group.owner ? el('button', { class: 'btn btn-danger-quiet btn-sm', type: 'button', onclick: () => run(async () => { current = await api.unshareNotes(group.id, n.document_id); }) }, 'Stop sharing') : null)))
        : el('p', { class: 'empty', text: 'Nothing shared yet.' }),
      share,
      el('button', { class: 'btn btn-danger-quiet btn-sm', type: 'button',
        onclick: () => { if (globalThis.confirm(`Leave ${group.name}? Notes you shared there stop being shared.`)) run(async () => { await api.leaveGroup(group.id); current = null; list = (await api.groups()).groups; }); } }, 'Leave this group'));
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); notify('Code copied.'); } catch { notify(`The code is ${text}`); }
  }

  function draw() {
    if (!signedIn() && guestRoot) { render(root, guestRoot); return; }   // demo mode: the seeded study circle (demo-circle.js)
    if (!signedIn()) {
      const how = el('ol', { class: 'how', id: 'howList', hidden: '' },
        ['Create a group and invite friends with a short code.', 'Share a set of notes so everyone studies from the same material.',
          'Challenge a friend to a five-question round on any topic.', 'Your own mastery and misconceptions stay private.'].map((text) => el('li', { text })));
      const toggle = el('button', { class: 'btn btn-secondary', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'howList',
        onclick: () => { how.hidden = !how.hidden; toggle.setAttribute('aria-expanded', String(!how.hidden)); } }, 'How groups work');
      render(root, el('div', { class: 'splitcta' },
        el('div', { class: 'ppl', 'aria-hidden': 'true' }, el('span', { style: 'left:12%;top:24%', text: 'V' }), el('span', { style: 'left:52%;top:10%', text: 'A' }),
          el('span', { style: 'left:20%;bottom:6%', text: 'R' }), el('span', { style: 'right:10%;bottom:20%', text: 'M' })),
        el('div', {}, el('span', { class: 'mono', text: 'A space for your people' }),
          el('h2', {}, 'Good ideas get better', el('br'), 'when they\'re shared.'),
          el('p', { text: 'Study groups and challenges need your own account, so friends can find your progress.' }),
          el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, el('button', { class: 'btn btn-primary', type: 'button', onclick: onSignIn }, 'Sign in or create an account'), toggle),
          how)));
      return;
    }
    render(root,
      el('p', { class: 'hint', text: 'Make a group, send friends the code, then share notes and compete on a weekly leaderboard.' }),
      list.length ? el('div', { class: 'group-tabs', role: 'group', 'aria-label': 'Your groups' }, list.map((g) => el('button',
        { class: `chip-action${current?.id === g.id ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(current?.id === g.id),
          onclick: () => run(() => open(g.id)) }, `${g.name} (${g.members})`))) : null,
      el('p', { class: 'auth-error', role: 'alert', text: message, hidden: message ? null : '' }),
      current ? detailNode(current) : null,
      entryForms());
  }

  load();
  return { refresh: load };
}
