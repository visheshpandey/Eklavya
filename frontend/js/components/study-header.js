// The top of the Study section: the picked topic (or an invitation to pick one) and its notes.
// The way to study it is picked ONCE, from the six mode cards above (Learn, Test, Revise, Viva, Debate, Free talk): there are no second sets of
// buttons here, so a first-time student is never shown the same choice twice.
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { selectDashboard, selectLanguage, selectSelectedTopicId, selectTopicDetail } from '../state/selectors.js';

export function mountStudyHeader({ store, root, onBrowse }) {
  function draw() {
    const state = store.getState();
    const { selectedTopicId, topicDetail: topic, dashboard } = state;

    if (selectedTopicId == null) {
      replaceContent(root, el('div', { class: 'empty-state' },
        el('strong', { text: 'Pick a topic to study' }),
        el('p', { text: 'Choose one from your notes. Eklavya teaches it step by step, then tests you by voice. Or tap the microphone and ask anything.' }),
        el('button', { class: 'btn btn-secondary mobile-only', type: 'button', onclick: onBrowse }, 'Open my notes')));
      return;
    }
    if (!topic) { replaceContent(root, el('p', { class: 'empty', text: 'Opening the topic...' })); return; }

    const row = dashboard?.mastery.find((m) => m.topic_id === topic.topic_id);
    const mastery = Math.round(row ? row.mastery_score : topic.mastery);
    const questionText = topic.question_count
      ? `${topic.question_count} practice questions ready`
      : 'Test questions are written from your notes when the test starts';

    replaceContent(root,
      el('div', { class: 'study-top' },
        el('div', { class: 'study-id' },
          el('p', { class: 'study-crumb', text: row ? `${row.document}  /  Topic` : 'Topic' }),
          el('h2', { class: 'study-title', text: topic.topic_name }),
          el('p', { class: 'study-meta' },
            el('span', { class: `meta-chip ${mastery >= 60 ? 'is-ok' : 'is-warn'}`, text: `Mastery ${mastery}%` }),
            el('span', { class: 'meta-chip', text: questionText }),
            topic.open_misconceptions.length
              ? el('span', { class: 'meta-chip is-brand' }, icon('warning', { size: 12 }), `To fix: ${topic.open_misconceptions[0].misconception_text}`) : null))),
      el('div', { class: 'study-details' },
        el('details', { class: 'notes' },
          el('summary', {}, el('span', { class: 'summary-badge', 'aria-hidden': 'true' }, icon('notebook', { size: 16 })), el('span', { class: 'summary-text', text: 'What your notes say' }), icon('caret-down', { size: 16 })),
          el('div', { class: 'notes-body' },
            topic.notes_are_related ? el('p', { class: 'notes-note', text: 'Nothing is filed under this topic, so these are the closest passages in your notes.' }) : null,
            ...(topic.notes.length
              ? topic.notes.map((n) => el('div', {}, n.heading && !n.text.startsWith(n.heading) ? el('strong', { text: n.heading }) : null, el('span', { text: n.text })))
              : [el('span', { text: 'No notes were matched to this topic.' })])))));
  }

  store.select(selectSelectedTopicId, draw);
  store.select(selectTopicDetail, draw);
  store.select(selectDashboard, draw);   // mastery changes while you study
  store.select(selectLanguage, draw);
}
