// The top of the Study section: the picked topic (or an invitation to pick one), its notes, and how to study it.
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { selectDashboard, selectSelectedTopicId, selectTopicDetail } from '../state/selectors.js';

/** "Debate me" panel: which side Eklavya takes, an optional motion, and the start button. */
function debatePanel(topic, onDebate) {
  const name = `debate-side-${topic.topic_id}`;
  const motion = el('input', { class: 'field', id: `debate-motion-${topic.topic_id}`, type: 'text', maxlength: '200', autocomplete: 'off',
    placeholder: `e.g. ${topic.topic_name} matters more than anything else in this unit` });
  const side = (value, label, checked) => el('label', { class: 'choice' },
    el('input', { type: 'radio', name, value, checked: checked ? '' : null }), el('span', { text: label }));
  const root = el('details', { class: 'notes debate' },
    el('summary', {}, icon('caret-down', { size: 18 }), 'Debate Eklavya on this topic'),
    el('div', { class: 'notes-body debate-body' },
      el('p', { class: 'hint', text: 'You talk, Eklavya argues back using your notes, then says who won and why.' }),
      el('fieldset', { class: 'choices' }, el('legend', { text: 'Eklavya argues' }),
        side('for', 'For the motion (you argue against)', true), side('against', 'Against the motion (you argue for)', false)),
      el('label', { class: 'field-label', for: motion.id, text: 'Motion (optional, Eklavya picks one if you leave it empty)' }), motion,
      el('div', { class: 'study-actions' },
        el('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
          root.open = false;   // get the panel out of the way of the conversation
          onDebate(topic.topic_id, { side: root.querySelector(`input[name="${name}"]:checked`)?.value ?? 'for', motion: motion.value.trim() });
        } },
        icon('chats-circle', { size: 18 }), 'Start the debate'))));
  return root;
}

export function mountStudyHeader({ store, root, onLearn, onTest, onDebate, onBrowse }) {
  let debateFor = null;   // {topicId, node}: kept between redraws so a typed motion survives mastery refreshes
  function debateNode(topic) {
    if (debateFor?.topicId !== topic.topic_id) debateFor = { topicId: topic.topic_id, node: debatePanel(topic, onDebate) };
    return debateFor.node;
  }

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
      debateNode(topic),
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
