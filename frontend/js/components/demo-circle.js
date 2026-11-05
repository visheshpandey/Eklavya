// The study circle in demo mode: three seeded friends (Aarav, Riya, Meera), this week's leaderboard by mastery gained, the notes they share, and a
// "challenge a friend" round (pick a friend and a topic, answer five questions, compare with their seeded score). All of it is the demo fixture
// (GET /api/demo/circle): nothing here touches a real account. The rows use the same class names as a real group, so the 3D orbit scene over
// the shared book (motion layer) draws from them.
import { el, render } from '../lib/dom.js';
import { masteryHistory } from '../lib/mastery-history.js';
import { leaderboardRow } from '../lib/leaderboard-row.js';
import { canScene } from '../motion/index.js';
import { selectDashboard, selectToday } from '../state/selectors.js';

/** The student's mastery gained this week, from the sparkline history (pure): average of (latest - first) over topics with at least two points. */
export function weeklyGain(seriesList) {
  const gains = seriesList.filter((values) => values.length >= 2).map((values) => values.at(-1) - values[0]);
  return gains.length ? Math.round(gains.reduce((a, b) => a + b, 0) / gains.length) : 0;
}

/** Leaderboard rows (pure): you and the friends, ranked by mastery gained this week. */
export function leaderboard(friends, yourGain, yourMastery, yourStreak = 0, yourName = 'You') {
  const rows = [...friends.map((f) => ({ name: f.name, gain: f.gain, mastery: f.mastery, streak: f.streak, you: false })),
    { name: yourName, gain: yourGain, mastery: yourMastery, streak: yourStreak, you: true }];
  return rows.sort((a, b) => b.gain - a.gain || b.mastery - a.mastery).map((row, i) => ({ ...row, rank: i + 1 }));
}

export function mountDemoCircle({ store, root, api, onSignIn, onNotes }) {
  let circle = null, friend = null, topic = null, round = null, error = '';

  async function load() {
    try { circle = await api.demoCircle(); } catch (failure) { error = failure.message ?? 'Could not load the demo circle.'; }
    draw();
  }

  const yourMastery = () => {
    const rows = (selectDashboard(store.getState())?.mastery ?? []).filter((m) => m.started !== false);
    return rows.length ? Math.round(rows.reduce((sum, m) => sum + m.mastery_score, 0) / rows.length) : 0;
  };
  const yourGain = () => weeklyGain((selectDashboard(store.getState())?.mastery ?? []).map((m) => masteryHistory.values(m.topic_id)));

  function startRound() {
    round = { questions: circle.challenges[topic], at: 0, score: 0, chosen: null, done: false };
    draw();
  }

  function question() {
    const q = round.questions[round.at];
    const answered = round.chosen !== null;
    return el('div', { class: 'challenge-q' },
      el('span', { class: 'mono', text: `Question ${round.at + 1} of ${round.questions.length} · vs ${friend.name}` }),
      el('h3', { class: 'serif-sm', text: q.question }),
      el('div', { class: 'opts' }, q.options.map((text, index) => el('button', {
        class: `opt${answered ? (index === q.correct ? ' right' : index === round.chosen ? ' wrong' : '') : ''}`, type: 'button', disabled: answered ? '' : null,
        onclick: () => { round.chosen = index; if (index === q.correct) round.score += 1; draw(); } }, `${String.fromCharCode(65 + index)}. ${text}`))),
      answered ? el('div', { class: 'why' }, el('p', { text: q.why }),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: () => { round.chosen = null; round.at += 1; if (round.at >= round.questions.length) round.done = true; draw(); } },
          round.at + 1 >= round.questions.length ? 'See the result' : 'Next question →')) : null);
  }

  function result() {
    const total = round.questions.length, theirs = friend.challenge_score;
    const verdict = round.score > theirs ? `You beat ${friend.name}!` : round.score === theirs ? `A tie with ${friend.name}.` : `${friend.name} wins this round.`;
    return el('div', { class: 'challenge-result' },
      el('span', { class: 'mono', text: 'Round complete' }), el('h3', { class: 'serif-sm', text: verdict }),
      el('div', { class: 'vs' }, el('div', {}, el('strong', { text: `${round.score} / ${total}` }), el('small', { class: 'mono', text: 'You' })),
        el('span', { class: 'mono', text: 'vs' }), el('div', {}, el('strong', { text: `${theirs} / ${total}` }), el('small', { class: 'mono', text: friend.name }))),
      el('div', { class: 'acts' },
        el('button', { class: 'btn btn-primary', type: 'button', onclick: startRound }, 'Rematch'),
        el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { round = null; draw(); } }, 'Choose another')));
  }

  function challengeBox() {
    if (round) return round.done ? result() : question();
    const topics = Object.keys(circle.challenges);
    friend ??= circle.friends[0]; topic ??= topics[0];
    return el('div', { class: 'challenge-pick' },
      el('div', { class: 'link-form' },
        el('label', { class: 'field-label', for: 'demo-friend', text: 'Friend' }),
        el('select', { id: 'demo-friend', class: 'select', onchange: (event) => { friend = circle.friends.find((f) => f.name === event.target.value); } },
          circle.friends.map((f) => el('option', { value: f.name, selected: f === friend ? '' : null }, f.name))),
        el('label', { class: 'field-label', for: 'demo-topic', text: 'Topic' }),
        el('select', { id: 'demo-topic', class: 'select', onchange: (event) => { topic = event.target.value; } }, topics.map((name) => el('option', { value: name, selected: name === topic ? '' : null }, name))),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: startRound }, 'Start a 5-question round')));
  }

  function draw() {
    if (error) { render(root, el('p', { class: 'auth-error', role: 'alert', text: error })); return; }
    if (!circle) { render(root, el('div', { class: 'skeleton sk-today', role: 'status', 'aria-label': 'Loading your study circle' })); return; }
    const rows = leaderboard(circle.friends, yourGain(), yourMastery(), selectToday(store.getState())?.streak ?? 0);   // you: the same streak and mastery as the sidebar
    render(root,
      el('div', { class: 'demo-note' }, el('span', { class: 'chip-static' }, 'Demo circle'),
        el('span', { class: 'hint', text: 'Aarav, Riya and Meera are sample friends. Sign in to study with your real friends.' }),
        el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: onSignIn }, 'Sign in or create an account')),
      el('div', { class: 'group-detail' },
        // the space for the 3D scene is held from the start; until it is ready (or if it cannot start) an animated 2D version of the same picture shows
        el('div', { class: 'orbit3d', 'aria-hidden': 'true' }, el('div', { class: 'orbit2d' }, el('span', { class: 'o2-book' }),
          rows.slice(0, 4).map((r, i) => el('span', { class: `o2-friend${r.you ? ' you' : ''}`, style: `--i:${i};--n:${Math.min(rows.length, 4)}`, text: r.name.slice(0, 1) })))),
        el('div', { class: 'group-code-row' }, el('strong', { text: circle.name }), el('span', { class: 'hint', text: 'Invite code' }), el('strong', { class: 'group-code', text: circle.code })),
        el('div', { class: 'gc-cols' }, el('section', { class: 'card gc-card' },
        el('h4', { text: 'This week: mastery gained' }),
        el('ol', { class: 'leaderboard' }, rows.map((r) => leaderboardRow(r, `${r.gain >= 0 ? '+' : ''}${r.gain} pts`))),
        el('p', { class: 'hint', text: 'Points are the average mastery gained across topics this week.' })),
        el('div', { class: 'gc-stack' }, el('section', { class: 'card gc-card' },
        el('h4', { text: 'Shared notes' }),
        el('ul', { class: 'list' }, circle.shared_notes.map((n) => el('li', { class: 'shared-note' },
          el('span', {}, el('strong', { text: n.title }), el('span', { class: 'hint', text: ` ${n.topics} topics, from ${n.by}` })),
          el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: onNotes }, 'Open in my notes'))))),
        el('section', { class: 'card gc-card' }, el('h4', { text: 'Challenge a friend' }), challengeBox())))));
  }

  document.addEventListener('eklavya:mastery-history', draw);
  store.select(selectDashboard, draw);
  store.select(selectToday, draw);
  load();
  return { refresh: load };
}
