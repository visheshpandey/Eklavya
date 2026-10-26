// Debate scoreboard: the strength of each argument the student makes (evidence, logic, rebuttal, 0-10), the
// running average as a meter, and the verdict card when the debate ends.
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/strings.js';
import { selectDebateScores, selectLanguage, selectVerdict } from '../state/selectors.js';

const PARTS = ['evidence', 'logic', 'rebuttal'];

function bar(label, value) {
  return el('div', { class: 'score-row' },
    el('span', { class: 'score-label', text: label }),
    el('div', { class: 'meter', role: 'img', 'aria-label': `${label} ${value} / 10` }, el('span', { style: `width:${value * 10}%` })),
    el('span', { class: 'score-value', text: String(value) }));
}

export function mountDebateScore({ store, root }) {
  function verdictCard(v, language) {
    const title = { student: 'debate.youWon', eklavya: 'debate.eklavyaWon', draw: 'debate.draw' }[v.winner] ?? 'debate.draw';
    return el('div', { class: `debate-verdict winner-${v.winner}`, role: 'status' },
      el('h3', { class: 'block-title' }, icon('trophy', { size: 20 }), t('debate.verdict', language)),
      el('p', { class: 'verdict-title', text: t(title, language) }),
      el('p', { class: 'hint', text: t('debate.scores', language, { you: v.student_score, eklavya: v.eklavya_score }) }),
      v.strength ? el('p', {}, el('strong', { text: `${t('debate.best', language)}: ` }), v.strength) : null,
      v.improve ? el('p', {}, el('strong', { text: `${t('debate.next', language)}: ` }), v.improve) : null);
  }

  function draw() {
    const state = store.getState();
    const scores = selectDebateScores(state);
    const verdict = selectVerdict(state);
    const language = selectLanguage(state);
    root.hidden = !scores.length && !verdict;
    if (root.hidden) { replaceContent(root); return; }
    const last = scores[scores.length - 1];
    replaceContent(root,
      scores.length ? el('div', { class: 'debate-meter' },
        el('div', { class: 'quiz-head' },
          el('h3', { class: 'quiz-count' }, icon('scales', { size: 20 }), t('debate.score', language)),
          el('span', { class: 'quiz-topic', text: t('debate.average', language, { n: last.average }) })),
        el('div', { class: 'meter meter-lg', role: 'img', 'aria-label': t('debate.average', language, { n: last.average }) },
          el('span', { style: `width:${last.average * 10}%` })),
        el('p', { class: 'hint', text: `${t('debate.round', language, { n: last.round })}${last.note ? ` · ${last.note}` : ''}` }),
        PARTS.map((part) => bar(t(`debate.${part}`, language), last[part]))) : null,
      verdict ? verdictCard(verdict, language) : null);
  }

  store.select(selectDebateScores, draw);
  store.select(selectVerdict, draw);
  store.select(selectLanguage, draw);
}
