// The top of Today, from the new design: greeting, the 3D desk with your next session, today's route (three steps) and your subjects.
// Everything comes from the real data: the plan, the due topics, the cards due and the notes' topics. The older plan list, due list and exam
// planner stay below ("More for today"); this adds the guided path on top.
import { el, render } from '../lib/dom.js';
import { dateLine, firstName, greetingKey } from '../lib/greeting.js';
import { t } from '../lib/strings.js';
import { buildRoute, loadRouteDone, routeProgress, saveRouteDone } from '../lib/route.js';
import { groupSubjects } from '../lib/subjects.js';
import { selectDashboard, selectLanguage, selectToday } from '../state/selectors.js';

const QUOTES = [
  'You don\'t have to know it all. Just understand the next thing.',
  'Small steps, taken every day, get you further than one long night.',
  'Being confused is the start of understanding, not the opposite of it.',
  'Explain it to yourself out loud. If it feels clear, it is.',
  'A little progress adds up.',
];
const dayNumber = (date) => Math.floor(date.getTime() / 86_400_000);

export function mountTodayHome({ store, head, hero, route, subjects, quote, talkButton, mapButton, storage = globalThis.localStorage, getName,
  onStartSession, onReviewCards, onAddNotes, onSubject, onTalk, onMap, mountScene = null, reduceMotion = false }) {
  const day = new Date().toISOString().slice(0, 10);
  let done = loadRouteDone(storage, day);
  let deskEl = null, floatEl = null, stickyOpen = null, stickyStreak = null, scene = null;
  const sceneInfo = ({ today, dashboard, steps }) => {   // what the 3D book's pages and cards say
    const next = steps[1].action ?? steps[0].action;
    const row = next ? (dashboard?.mastery ?? []).find((m) => m.topic_id === next.topicId) : null;
    return { topic: next ? (row?.topic_name ?? steps[1].sub.replace(/, in a voice session$/, '')) : '', mastery: row?.mastery_score ?? 0,
      open: (dashboard?.alerts ?? []).filter((a) => a.type === 'misconception').length, streak: today?.streak ?? 0, steps: steps.map((step) => step.title) };
  };

  const dataNow = () => {
    const state = store.getState();
    const today = selectToday(state);
    const dashboard = selectDashboard(state);
    return { today, dashboard, steps: buildRoute({ plan: today?.plan ?? [], due: today?.due ?? [], mastery: dashboard?.mastery ?? [], cardsDue: today?.cards_due ?? 0 }) };
  };

  function drawHead() {
    const name = firstName(getName());
    const greeting = t(greetingKey(new Date()), selectLanguage(store.getState()));
    render(head,
      el('p', { class: 'mono', text: dateLine(new Date()) }),
      // with a name: "Good evening, Asha."  without one: just "Good evening." (never a made-up name)
      el('h1', { class: 'page-title' }, name ? [el('span', { text: `${greeting},` }), ' ', el('em', { text: `${name}.` })] : [el('span', { text: greeting }), el('em', { text: '.' })]),
      el('p', { class: 'lead', text: 'Let\'s make one thing clearer today.' }));
  }

  function drawHero(data) {
    const { today, dashboard, steps } = data;
    const next = steps[1].action ?? steps[0].action;
    const topicRow = next ? (dashboard?.mastery ?? []).find((m) => m.topic_id === next.topicId) : null;
    const topicName = topicRow?.topic_name ?? steps[1].sub.replace(/, in a voice session$/, '');
    const open = (dashboard?.alerts ?? []).filter((a) => a.type === 'misconception').length;
    const streak = today?.streak ?? 0;

    const book = el('div', { class: 'book' },
      el('div', { class: 'cover' }),
      el('div', { class: 'page l' }, el('span', { class: 'mono', text: next ? 'Your next topic' : 'Your notes' }),
        el('div', { class: 't', text: next ? topicName : 'Add your notes' }), el('i'), el('i'), el('i', { class: 's' }),
        el('div', { class: 'heq', text: topicRow ? `${Math.round(topicRow.mastery_score)}% mastery` : 'ready when you are' }), el('i')),
      el('div', { class: 'page r' }, el('span', { class: 'mono', text: 'Where you are' }), el('div', { class: 'hill hb' }), el('div', { class: 'hill hf' }),
        el('p', { class: 'cap', text: 'Pick up where you left off.' }), el('i'), el('i')),
      el('div', { class: 'spine' }));
    if (!deskEl) {   // built once and kept: the 3D scene lives in it and must not be rebuilt each time the data refreshes
      floatEl = el('div', { class: 'float' }, book);
      stickyOpen = el('strong', { text: String(open) });
      stickyStreak = el('strong', {}, `${streak}-day streak.`);
      deskEl = el('div', { class: 'desk', id: 'desk', 'aria-hidden': 'true' }, floatEl,
        el('div', { class: 'sticky n1' }, el('small', { class: 'mono', text: 'Open mistakes' }), stickyOpen),
        el('div', { class: 'sticky n2' }, el('small', { class: 'mono', text: 'Keep it going' }), stickyStreak));
      scene = mountScene?.(deskEl, sceneInfo(data)) ?? null;
    } else {
      floatEl.replaceChildren(book);
      stickyOpen.textContent = String(open);
      stickyStreak.textContent = `${streak}-day streak.`;
      scene?.update(sceneInfo(data));
    }
    const desk = deskEl;

    const startButton = el('button', { class: 'btn btn-primary', type: 'button',
      onclick: () => (next ? onStartSession(next.mode ?? 'learn', next.topicId) : onAddNotes()) }, next ? 'Start learning ↗' : 'Add notes ↗');
    render(hero, el('div', { class: 'hero' },
      el('div', {}, el('span', { class: 'mono', text: '● Your next session' }),
        el('h2', {}, next ? topicName : 'Your notes,', el('br'), el('em', { text: next ? 'one clear step at a time.' : 'explained out loud.' })),
        el('p', { text: next ? `Continue with ${topicName}: a short voice lesson, then a quick check on what stuck.` : 'Add notes and Eklavya plans your day, talks you through each topic and tests you by voice.' }),
        startButton),
      desk));
    if (!reduceMotion) {   // the desk and book lean toward the pointer
      const book3d = desk.querySelector('.book');
      desk.addEventListener('pointermove', (event) => {
        const box = desk.getBoundingClientRect(), x = (event.clientX - box.left) / box.width - 0.5, y = (event.clientY - box.top) / box.height - 0.5;
        desk.style.setProperty('--px', x.toFixed(3)); desk.style.setProperty('--py', y.toFixed(3));
        book3d.style.setProperty('--tx', `${(-y * 22).toFixed(1)}deg`); book3d.style.setProperty('--ty', `${(x * 26).toFixed(1)}deg`);
      });
      desk.addEventListener('pointerleave', () => {
        desk.style.setProperty('--px', 0); desk.style.setProperty('--py', 0);
        book3d.style.setProperty('--tx', '0deg'); book3d.style.setProperty('--ty', '0deg');
      });
    }
  }

  function drawRoute({ steps }) {
    const progress = routeProgress(done);
    render(route,
      el('span', { class: 'mono', text: progress.label }),
      el('span', { class: 'bar' }, el('i', { style: `width:${progress.percent}%` })),
      steps.map((step, index) => {
        const finished = Boolean(done[step.key]);
        const current = !finished && progress.current === step.key;
        const run = () => (step.action?.type === 'cards' ? onReviewCards() : step.action ? onStartSession(step.action.mode, step.action.topicId) : onAddNotes());
        return el('button', { class: `rstep${finished ? ' done' : ''}${current ? ' cur' : ''}`, type: 'button', 'data-step': step.key, onclick: run },
          el('span', { class: 'mk', text: finished ? '✓' : String(index + 1).padStart(2, '0') }),
          el('span', {}, el('b', { text: step.title }), el('small', { text: step.sub })),
          el('time', { text: `${step.minutes} min` }));
      }));
  }

  function drawSubjects({ dashboard }) {
    const list = groupSubjects(dashboard?.mastery ?? []).slice(0, 6);
    if (!list.length) {
      render(subjects, el('div', { class: 'sub s-g' }, el('span', { class: 'mono', text: 'Nothing here yet' }), el('span', { class: 'serif-sm', text: 'Add your first notes' }),
        el('span', { class: 'det', text: 'Your subjects appear here with their mastery.' }),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: onAddNotes }, 'Add notes ↗')));
      return;
    }
    render(subjects, list.map((subject) => {
      const card = el('button', { class: `sub s-${subject.tone}`, type: 'button', onclick: () => onSubject(subject.weakestTopicId) },
        el('span', { class: 'mono', text: subject.label }), el('span', { class: 'serif-sm', text: subject.name }),
        el('span', { class: 'det', text: `${subject.topics} topic${subject.topics === 1 ? '' : 's'} · ${subject.weak ? `${subject.weak} to revisit` : 'all steady'}` }),
        el('span', { class: 'bar' }, el('i', { style: `width:${subject.mastery ?? 0}%` })),
        el('span', { class: 'row mono' }, el('span', { text: 'Mastery' }), el('strong', { text: subject.mastery === null ? 'Not started' : `${subject.mastery}%` })));
      return card;
    }));
  }

  /** Placeholders the size of the real thing while the first data loads, so nothing below them moves when it arrives. */
  function drawSkeleton() {
    drawHead();
    render(hero, el('div', { class: 'skeleton sk-hero', role: 'status', 'aria-label': 'Loading your day' }));
    render(route, el('span', { class: 'skeleton sk-line' }), [1, 2, 3].map(() => el('span', { class: 'skeleton sk-step' })));
    render(subjects, [1, 2, 3, 4, 5, 6].map(() => el('span', { class: 'skeleton sk-sub' })));
  }

  function draw() {
    const data = dataNow();
    if (!data.today || !data.dashboard) { drawSkeleton(); return; }
    drawHead();
    drawHero(data);
    drawRoute(data);
    drawSubjects(data);
    quote.textContent = `“${QUOTES[dayNumber(new Date()) % QUOTES.length]}”`;
  }

  talkButton.addEventListener('click', onTalk);
  mapButton.addEventListener('click', onMap);
  store.select(selectDashboard, draw);
  store.select(selectToday, draw);
  store.select(selectLanguage, draw);

  return {
    /** A step of today's route was finished: remembered for the day. */
    markDone(key) {
      if (done[key]) return false;
      done = { ...done, [key]: true };
      saveRouteDone(storage, day, done);
      drawRoute(dataNow());
      return true;
    },
    isDone: (key) => Boolean(done[key]),
    redraw: draw,
  };
}
