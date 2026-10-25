// The one pure function that decides how state changes. No DOM, no network, no timers: easy to test.
import { ActionType as A } from './actions.js';
import { VOICE_STATUS, SESSION_MODE } from '../lib/protocol.js';

const emptySession = () => ({
  mode: SESSION_MODE.FREE,
  topicId: null,
  phase: null,        // {phase: 'teaching'|'test'|'summary', topic}
  messages: [],       // [{role: 'user'|'tutor', text, final, cut?}]
  emotion: null,      // latest tone reading
  question: null,     // quiz question currently on screen
  result: null,       // grade of that question
  summary: null,      // end-of-test summary
});

export const initialState = Object.freeze({
  voiceStatus: VOICE_STATUS.IDLE,
  banner: null,
  toasts: [],
  dashboard: null,
  mission: null,
  selectedTopicId: null,
  topicDetail: null,
  session: emptySession(),
});

/** Dashboard and server events spell mission fields differently; the UI uses one shape. */
export function normalizeMission(m) {
  if (!m) return null;
  return {
    title: m.title ?? m.mission_title ?? '',
    duration_minutes: m.duration_minutes ?? 15,
    priority: m.priority ?? '',
    reason: m.reason ?? '',
    tasks: m.tasks ?? [],
  };
}

const withSession = (state, patch) => ({ ...state, session: { ...state.session, ...patch } });

const lastOpenIndex = (messages, role) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === role && !messages[i].final) return i;
  }
  return -1;
};

/** Live transcript: chunks (final=false) grow the open bubble; the final text replaces it. */
function receiveTranscript(state, { role, text, final }) {
  const messages = state.session.messages;
  const open = lastOpenIndex(messages, role);
  let next;
  if (open >= 0) {
    next = messages.map((m, i) => (i !== open ? m : { ...m, text: final ? text : m.text + text, final: Boolean(final) }));
  } else {
    next = [...messages, { role, text, final: Boolean(final) }];
  }
  return withSession(state, { messages: next });
}

export function reducer(state, action) {
  const { payload } = action;
  switch (action.type) {
    case A.VOICE_STATUS_CHANGED:
      if (payload === state.voiceStatus) return state;
      return payload === VOICE_STATUS.IDLE
        ? { ...withSession(state, { phase: null }), voiceStatus: payload }
        : { ...state, voiceStatus: payload };

    case A.BANNER_SET:
      return payload === state.banner ? state : { ...state, banner: payload || null };

    case A.TOAST_ADDED:
      return { ...state, toasts: [...state.toasts, payload] };
    case A.TOAST_REMOVED:
      return { ...state, toasts: state.toasts.filter((t) => t.id !== payload) };

    case A.DASHBOARD_LOADED:
      return { ...state, dashboard: payload, mission: payload.mission ? normalizeMission(payload.mission) : state.mission };

    case A.TOPIC_SELECTED:
      return { ...state, selectedTopicId: payload, topicDetail: state.selectedTopicId === payload ? state.topicDetail : null };
    case A.TOPIC_LOADED:
      return payload.topic_id === state.selectedTopicId ? { ...state, topicDetail: payload } : state;

    case A.NOTES_RESET:
      return { ...state, banner: null, mission: null, selectedTopicId: null, topicDetail: null, session: emptySession() };

    case A.SESSION_STARTED:
      return { ...state, banner: null, session: { ...emptySession(), mode: payload.mode, topicId: payload.topicId } };

    case A.TRANSCRIPT_RECEIVED:
      return receiveTranscript(state, payload);
    case A.TURN_INTERRUPTED: {
      const open = lastOpenIndex(state.session.messages, 'tutor');
      if (open < 0) return state;
      return withSession(state, { messages: state.session.messages.map((m, i) => (i === open ? { ...m, final: true, cut: true } : m)) });
    }

    case A.EMOTION_REPORTED:
      return withSession(state, { emotion: payload });
    case A.PHASE_CHANGED:
      return withSession(state, { phase: { phase: payload.phase, topic: payload.topic } });
    case A.QUESTION_ASKED:
      return withSession(state, { question: payload, result: null, summary: null });
    case A.ANSWER_GRADED:
      return withSession(state, { result: payload });
    case A.TEST_SUMMARIZED:
      return withSession(state, { summary: payload });
    case A.MISSION_RECEIVED:
      return { ...state, mission: normalizeMission(payload) };

    default:
      return state;
  }
}
