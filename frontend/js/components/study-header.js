// The top of the Study section: the picked topic (or an invitation to pick one), its notes, and how to study it.
import { el, render as replaceContent } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/strings.js';
import { selectDashboard, selectLanguage, selectSelectedTopicId, selectTopicDetail } from '../state/selectors.js';

/** "Debate me" panel: which side Eklavya takes, how hard it pushes, an optional motion, and the start button. */
function debatePanel(topic, onDebate, language) {
  const name = `debate-side-${topic.topic_id}`;
  const styleName = `debate-style-${topic.topic_id}`;
  const style = (value, label, checked) => el('label', { class: 'choice' },
    el('input', { type: 'radio', name: styleName, value, checked: checked ? '' : null }), el('span', { text: label }));
  const motion = el('input', { class: 'field', id: `debate-motion-${topic.topic_id}`, type: 'text', maxlength: '200', autocomplete: 'off',
    placeholder: `e.g. ${topic.topic_name} matters more than anything else in this unit` });
  const side = (value, label, sub, checked) => el('label', { class: 'choice' },
    el('input', { type: 'radio', name, value, checked: checked ? '' : null }),
    el('span', { class: 'choice-text' }, el('span', { class: 'choice-title', text: label }), el('span', { class: 'choice-sub', text: sub })));
  const root = el('details', { class: 'notes debate' },
    el('summary', {}, el('span', { class: 'summary-badge is-brand', 'aria-hidden': 'true' }, icon('chats-circle', { size: 16 })), el('span', { class: 'summary-text', text: 'Debate Eklavya on this topic' }), icon('caret-down', { size: 16 })),
    el('div', { class: 'notes-body debate-body' },
      el('p', { class: 'hint', text: 'You talk, Eklavya argues back using your notes, then says who won and why.' }),
      el('fieldset', { class: 'choices' }, el('legend', { text: 'Eklavya argues' }),
        side('for', 'For the motion', 'You argue against', true), side('against', 'Against the motion', 'You argue for', false)),
      el('fieldset', { class: 'choices' }, el('legend', { text: t('study.style', language) }),
        style('tough', t('study.tough', language), true), style('friendly', t('study.friendly', language), false)),
      el('label', { class: 'field-label', for: motion.id, text: 'Motion (optional, Eklavya picks one if you leave it empty)' }), motion,
      el('div', { class: 'study-actions' },
        el('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
          root.open = false;   // get the panel out of the way of the conversation
          onDebate(topic.topic_id, { side: root.querySelector(`input[name="${name}"]:checked`)?.value ?? 'for', motion: motion.value.trim(),
            style: root.querySelector(`input[name="${styleName}"]:checked`)?.value ?? 'tough' });
        } },
        icon('chats-circle', { size: 18 }), 'Start the debate', el('kbd', { 'aria-hidden': 'true' }, 'D')))));
  return root;
}

export function mountStudyHeader({ store, root, onLearn, onTest, onRevise, onViva, onDebate, onBrowse }) {
  let debateFor = null;   // {topicId, language, node}: kept between redraws so a typed motion survives mastery refreshes
  function debateNode(topic, language) {
    if (debateFor?.topicId !== topic.topic_id || debateFor.language !== language) {
      debateFor = { topicId: topic.topic_id, language, node: debatePanel(topic, onDebate, language) };
    }
    return debateFor.node;
  }

  function draw() {
    const state = store.getState();
    const { selectedTopicId, topicDetail: topic, dashboard } = state;
    const language = selectLanguage(state);

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
              ? el('span', { class: 'meta-chip is-brand' }, icon('warning', { size: 12 }), `To fix: ${topic.open_misconceptions[0].misconception_text}`) : null)),
      el('div', { class: 'study-actions' },
        el('button', { class: 'btn btn-secondary', type: 'button', 'aria-keyshortcuts': 'Q', title: 'Just test me (Q)', onclick: () => onTest(topic.topic_id) }, 'Just test me', el('kbd', { 'aria-hidden': 'true' }, 'Q')),
        el('button', { class: 'btn btn-primary', type: 'button', 'aria-keyshortcuts': 'T', title: 'Teach me this, then test me (T)', onclick: () => onLearn(topic.topic_id) }, icon('play', { size: 14 }), 'Teach me this, then test me', el('kbd', { 'aria-hidden': 'true' }, 'T')),
        el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => onViva(topic.topic_id) }, icon('student', { size: 18 }), t('study.viva', language)),
        el('button', { class: 'btn btn-quiet', type: 'button', onclick: () => onRevise(topic.topic_id) }, icon('arrow-counter-clockwise', { size: 18 }), t('study.revise', language)))),
      el('div', { class: 'study-details' },
      debateNode(topic, language),
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
