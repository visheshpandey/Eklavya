// The one pure function that decides how state changes. No DOM, no network, no timers: easy to test.
import { ActionType as A } from './actions.js';
import { LANGUAGES, VOICE_STATUS, SESSION_MODE } from '../lib/protocol.js';

const emptySession = () => ({
  mode: SESSION_MODE.FREE,
  topicId: null,
  phase: null,        // {phase: 'teaching'|'test'|'summary'|'debate', topic, side?, motion?} (side = the side the tutor argues)
  messages: [],       // [{role: 'user'|'tutor', text, final, cut?}]
  emotion: null,      // latest tone reading
  question: null,     // quiz question currently on screen
  result: null,       // grade of that question
  summary: null,      // end-of-test summary
  boards: [],         // whiteboard cards shown this session, oldest first (at most MAX_BOARDS)
  boardIndex: -1,     // which board is on screen; -1 = none
  viva: null,         // viva: {question, marks: [{number, mark, out_of, feedback}], report}
  debateScores: [],   // debate: one score per student argument
  verdict: null,      // debate: the final verdict
});

export const MAX_BOARDS = 12;

export const VIEWS = Object.freeze({ TODAY: 'today', LIBRARY: 'library', STUDY: 'study', PROGRESS: 'progress' });
export const THEMES = Object.freeze({ SYSTEM: 'system', LIGHT: 'light', DARK: 'dark' });

const initialUi = () => ({
  view: VIEWS.TODAY,          // which section is showing (on wide screens the library is always visible)
  librarySearch: '',
  collapsedDocs: {},          // {documentId: true} for notes whose topic list is folded
  theme: THEMES.SYSTEM,
  language: LANGUAGES.HINGLISH,   // tutor language; Hindi also switches the interface labels to Hindi
  captions: false,           // big live captions of what Eklavya says
  onboarding: false,         // the first-run guide is open
  celebration: null,         // {id, text}: the latest win to celebrate
});

export const initialState = Object.freeze({
  ui: initialUi(),
  voiceStatus: VOICE_STATUS.IDLE,
  banner: null,
  toasts: [],
  dashboard: null,
  mission: null,
  selectedTopicId: null,
  topicDetail: null,
  session: emptySession(),
  today: null,        // GET /api/today
  history: null,      // GET /api/history
  plan: null,         // GET /api/plan
  conceptMap: null,   // GET /api/concept-map
  flashcards: { topicId: null, cards: [] },
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
const withUi = (state, patch) => ({ ...state, ui: { ...state.ui, ...patch } });

const lastOpenIndex = (messages, role) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === role && !messages[i].final) return i;
  }
  return -1;
};

/**
 * A new board goes on screen. A board with the same title and kind as one already shown means the tutor is
 * updating it (next step, filled-in result, or going back to it), so that card is replaced and brought into view.
 */
function showBoard(state, board) {
  const { boards } = state.session;
  const same = boards.findIndex((b) => b.title === board.title && b.kind === board.kind);
  if (same >= 0) return withSession(state, { boards: boards.map((b, i) => (i === same ? board : b)), boardIndex: same });
  const next = [...boards, board].slice(-MAX_BOARDS);
  return withSession(state, { boards: next, boardIndex: next.length - 1 });
}

/** Live transcript: chunks (final=false) grow the open bubble; the final text replaces it. */
function receiveTranscript(state, { role, text, final, image }) {
  const messages = state.session.messages;
  if (image) return withSession(state, { messages: [...messages, { role, text, final: true, image }] });   // a shared photo
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

    case A.TOPIC_SELECTED:   // picking a topic takes the student to the Study section
      return withUi({ ...state, selectedTopicId: payload, topicDetail: state.selectedTopicId === payload ? state.topicDetail : null }, { view: VIEWS.STUDY });
    case A.TOPIC_LOADED:
      return payload.topic_id === state.selectedTopicId ? { ...state, topicDetail: payload } : state;

    case A.NOTES_RESET:
      return withUi({ ...state, banner: null, mission: null, selectedTopicId: null, topicDetail: null, session: emptySession(),
        conceptMap: null, flashcards: { topicId: null, cards: [] } }, { librarySearch: '', collapsedDocs: {} });

    case A.SESSION_STARTED:
      return withUi({ ...state, banner: null, session: { ...emptySession(), mode: payload.mode, topicId: payload.topicId } }, { view: VIEWS.STUDY });

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
      return withSession(state, { phase: { phase: payload.phase, topic: payload.topic, ...(payload.side ? { side: payload.side, motion: payload.motion } : {}) } });
    case A.QUESTION_ASKED:
      return withSession(state, { question: payload, result: null, summary: null });
    case A.ANSWER_GRADED:
      return withSession(state, { result: payload });
    case A.TEST_SUMMARIZED:
      return withSession(state, { summary: payload });
    case A.BOARD_SHOWN:
      return showBoard(state, payload);
    case A.BOARD_PICKED:
      return Number.isInteger(payload) && payload >= 0 && payload < state.session.boards.length && payload !== state.session.boardIndex
        ? withSession(state, { boardIndex: payload }) : state;
    case A.VIVA_QUESTION_ASKED:
      return withSession(state, { viva: { marks: [], report: null, ...state.session.viva, question: payload } });
    case A.VIVA_MARKED: {
      const viva = state.session.viva ?? { question: null, marks: [], report: null };
      return withSession(state, { viva: { ...viva, marks: [...viva.marks.filter((m) => m.number !== payload.number), payload] } });
    }
    case A.VIVA_REPORTED:
      return withSession(state, { viva: { marks: [], ...state.session.viva, question: null, report: payload } });
    case A.DEBATE_SCORED:
      return withSession(state, { debateScores: [...state.session.debateScores, payload] });
    case A.DEBATE_JUDGED:
      return withSession(state, { verdict: payload });
    case A.TODAY_LOADED:
      return { ...state, today: payload };
    case A.HISTORY_LOADED:
      return { ...state, history: payload };
    case A.PLAN_LOADED:
      return { ...state, plan: payload };
    case A.CONCEPT_MAP_LOADED:
      return { ...state, conceptMap: payload };
    case A.FLASHCARDS_LOADED:
      return { ...state, flashcards: { topicId: payload.topicId ?? null, cards: payload.cards ?? [] } };
    case A.CAPTIONS_TOGGLED:
      return withUi(state, { captions: !state.ui.captions });
    case A.LANGUAGE_CHANGED:
      return Object.values(LANGUAGES).includes(payload) && payload !== state.ui.language ? withUi(state, { language: payload }) : state;
    case A.ONBOARDING_SET:
      return Boolean(payload) === state.ui.onboarding ? state : withUi(state, { onboarding: Boolean(payload) });
    case A.CELEBRATED:
      return withUi(state, { celebration: payload });
    case A.MISSION_RECEIVED:
      return { ...state, mission: normalizeMission(payload) };

    case A.VIEW_CHANGED:
      return Object.values(VIEWS).includes(payload) && payload !== state.ui.view ? withUi(state, { view: payload }) : state;
    case A.LIBRARY_SEARCHED:
      return payload === state.ui.librarySearch ? state : withUi(state, { librarySearch: payload });
    case A.DOCUMENT_TOGGLED: {
      const collapsed = { ...state.ui.collapsedDocs };
      if (collapsed[payload]) delete collapsed[payload]; else collapsed[payload] = true;
      return withUi(state, { collapsedDocs: collapsed });
    }
    case A.THEME_CHANGED:
      return Object.values(THEMES).includes(payload) && payload !== state.ui.theme ? withUi(state, { theme: payload }) : state;

    default:
      return state;
  }
}
