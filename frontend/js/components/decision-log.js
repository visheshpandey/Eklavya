// "Why the tutor did that": the agents' recent observations, decisions and actions.
import { el, render as replaceContent } from '../lib/dom.js';
import { selectDashboard } from '../state/selectors.js';

const SHOWN = 8;

/** One row of the log: which agent, what it saw, what it decided, what it did. Shared with the Behind the scenes panel. */
export const decisionItem = (entry) => el('li', {},
  el('span', { class: 'agent', text: entry.agent_name.replace('_', ' ') }),
  el('span', { class: 'obs', text: `Saw: ${entry.observation}` }),
  el('span', { class: 'dec', text: `Decided: ${entry.decision}` }),
  entry.action_taken ? el('span', { class: 'act', text: `Did: ${entry.action_taken}` }) : null);

export function mountDecisionLog({ store, root }) {
  store.select(selectDashboard, (dashboard) => {
    replaceContent(root, ...(dashboard?.agent_log ?? []).slice(0, SHOWN).map(decisionItem));
  });
}
