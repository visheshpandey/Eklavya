// What the student's notes say about the picked topic, with the two ways to study it.
import { el, render } from '../lib/dom.js';
import { selectTopicDetail } from '../state/selectors.js';

export function mountTopicCard({ store, root, onLearn, onTest }) {
  store.select(selectTopicDetail, (topic) => {
    root.hidden = !topic;
    if (!topic) { root.replaceChildren(); return; }
    render(root,
      el('div', { class: 'card-title' }, el('span', { text: 'Selected topic' }), el('span', { class: 'pill', text: `Mastery ${Math.round(topic.mastery)}%` })),
      el('h3', { text: topic.topic_name }),
      el('p', { class: 'meta', text: topic.question_count ? `${topic.question_count} practice question(s) ready` : 'Test questions are written from your notes when the test starts' }),
      topic.notes_are_related ? el('p', { class: 'hint', text: 'Nothing is filed under this topic, so these are the closest passages in your notes.' }) : null,
      el('div', { class: 'notes' }, topic.notes.length
        ? topic.notes.map((n) => el('div', {}, n.heading && !n.text.startsWith(n.heading) ? el('strong', { text: n.heading }) : null, el('span', { text: n.text })))
        : [el('span', { text: 'No notes were matched to this topic.' })]),
      topic.open_misconceptions.length ? el('p', { class: 'warn', text: `To fix: ${topic.open_misconceptions[0].misconception_text}` }) : null,
      el('div', { class: 'actions' },
        el('button', { class: 'btn', type: 'button', onclick: () => onLearn(topic.topic_id) }, 'Teach me this, then test me (voice)'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => onTest(topic.topic_id) }, 'Just test me (voice)')),
    );
    root.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  });
}
