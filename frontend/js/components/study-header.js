// The top of the Study section: the picked topic (or an invitation to pick one), its notes, and how to study it.
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { selectDashboard, selectSelectedTopicId, selectTopicDetail } from '../state/selectors.js';

export function mountStudyHeader({ store, root, onLearn, onTest, onBrowse }) {
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
      el('h2', { class: 'study-title', text: topic.topic_name }),
      el('p', { class: 'study-meta' },
        el('span', { text: `Mastery ${mastery}%` }),
        row ? el('span', { text: `From ${row.document}` }) : null,
        el('span', { text: questionText })),
      topic.open_misconceptions.length ? el('p', { class: 'callout', text: `To fix: ${topic.open_misconceptions[0].misconception_text}` }) : null,
      el('div', { class: 'study-actions' },
        el('button', { class: 'btn btn-primary', type: 'button', onclick: () => onLearn(topic.topic_id) }, icon('play', { size: 18 }), 'Teach me this, then test me'),
        el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => onTest(topic.topic_id) }, 'Just test me')),
      el('details', { class: 'notes' },
        el('summary', {}, icon('caret-down', { size: 18 }), 'What your notes say'),
        el('div', { class: 'notes-body' },
          topic.notes_are_related ? el('p', { class: 'notes-note', text: 'Nothing is filed under this topic, so these are the closest passages in your notes.' }) : null,
          ...(topic.notes.length
            ? topic.notes.map((n) => el('div', {}, n.heading && !n.text.startsWith(n.heading) ? el('strong', { text: n.heading }) : null, el('span', { text: n.text })))
            : [el('span', { text: 'No notes were matched to this topic.' })]))));
  }

  store.select(selectSelectedTopicId, draw);
  store.select(selectTopicDetail, draw);
  store.select(selectDashboard, draw);   // mastery changes while you study
}
