// Every way the state can change, as plain action creators. Controllers dispatch these; the reducer handles them.

export const ActionType = Object.freeze({
  VOICE_STATUS_CHANGED: 'voice/statusChanged',
  BANNER_SET: 'ui/bannerSet',
  TOAST_ADDED: 'ui/toastAdded',
  TOAST_REMOVED: 'ui/toastRemoved',
  DASHBOARD_LOADED: 'data/dashboardLoaded',
  TOPIC_SELECTED: 'topic/selected',
  TOPIC_LOADED: 'topic/loaded',
  NOTES_RESET: 'data/notesReset',
  SESSION_STARTED: 'session/started',
  TRANSCRIPT_RECEIVED: 'session/transcript',
  TURN_INTERRUPTED: 'session/interrupted',
  EMOTION_REPORTED: 'session/emotion',
  PHASE_CHANGED: 'session/phase',
  QUESTION_ASKED: 'session/question',
  ANSWER_GRADED: 'session/graded',
  TEST_SUMMARIZED: 'session/summary',
  MISSION_RECEIVED: 'session/mission',
  BOARD_SHOWN: 'session/boardShown',
  BOARD_PICKED: 'session/boardPicked',
  VIVA_QUESTION_ASKED: 'session/vivaQuestion',
  VIVA_MARKED: 'session/vivaMarked',
  VIVA_REPORTED: 'session/vivaReport',
  DEBATE_SCORED: 'session/debateScored',
  DEBATE_JUDGED: 'session/debateJudged',
  TODAY_LOADED: 'data/todayLoaded',
  HISTORY_LOADED: 'data/historyLoaded',
  PLAN_LOADED: 'data/planLoaded',
  CONCEPT_MAP_LOADED: 'data/conceptMapLoaded',
  FLASHCARDS_LOADED: 'data/flashcardsLoaded',
  CAPTIONS_TOGGLED: 'ui/captionsToggled',
  LANGUAGE_CHANGED: 'ui/languageChanged',
  ONBOARDING_SET: 'ui/onboardingSet',
  CELEBRATED: 'ui/celebrated',
  VIEW_CHANGED: 'ui/viewChanged',
  LIBRARY_SEARCHED: 'ui/librarySearched',
  DOCUMENT_TOGGLED: 'ui/documentToggled',
  THEME_CHANGED: 'ui/themeChanged',
});

const make = (type) => (payload) => ({ type, payload });

export const actions = {
  voiceStatusChanged: make(ActionType.VOICE_STATUS_CHANGED),   // 'idle' | 'connecting' | 'listening' | 'speaking'
  bannerSet: make(ActionType.BANNER_SET),                      // string | null
  toastAdded: make(ActionType.TOAST_ADDED),                    // {id, kind, text}
  toastRemoved: make(ActionType.TOAST_REMOVED),                // id
  dashboardLoaded: make(ActionType.DASHBOARD_LOADED),          // GET /api/dashboard payload
  topicSelected: make(ActionType.TOPIC_SELECTED),              // topicId
  topicLoaded: make(ActionType.TOPIC_LOADED),                  // GET /api/topics/{id} payload
  notesReset: make(ActionType.NOTES_RESET),                    // new notes loaded: clear everything tied to the old ones
  sessionStarted: make(ActionType.SESSION_STARTED),            // {mode, topicId}
  transcriptReceived: make(ActionType.TRANSCRIPT_RECEIVED),    // {role, text, final}
  turnInterrupted: make(ActionType.TURN_INTERRUPTED),
  emotionReported: make(ActionType.EMOTION_REPORTED),          // server `emotion` event
  phaseChanged: make(ActionType.PHASE_CHANGED),                // server `phase` event
  questionAsked: make(ActionType.QUESTION_ASKED),              // server `quiz_question` event
  answerGraded: make(ActionType.ANSWER_GRADED),                // server `mastery` event
  testSummarized: make(ActionType.TEST_SUMMARIZED),            // server `test_summary` event
  missionReceived: make(ActionType.MISSION_RECEIVED),          // server `mission` event
  boardShown: make(ActionType.BOARD_SHOWN),                    // server `board` event: {kind, title, ...}
  boardPicked: make(ActionType.BOARD_PICKED),                  // index of an earlier board to look at again
  vivaQuestionAsked: make(ActionType.VIVA_QUESTION_ASKED),     // server `viva_question`: {number, total, question, seconds, topic}
  vivaMarked: make(ActionType.VIVA_MARKED),                    // server `viva_mark`: {number, mark, out_of, feedback, ...}
  vivaReported: make(ActionType.VIVA_REPORTED),                // server `viva_report`: the report card
  debateScored: make(ActionType.DEBATE_SCORED),                // server `debate_score`: one argument's scores
  debateJudged: make(ActionType.DEBATE_JUDGED),                // server `debate_verdict`
  todayLoaded: make(ActionType.TODAY_LOADED),                  // GET /api/today
  historyLoaded: make(ActionType.HISTORY_LOADED),              // GET /api/history: {vivas, debates}
  planLoaded: make(ActionType.PLAN_LOADED),                    // GET/PUT /api/plan
  conceptMapLoaded: make(ActionType.CONCEPT_MAP_LOADED),       // GET /api/concept-map: {nodes, links}
  flashcardsLoaded: make(ActionType.FLASHCARDS_LOADED),        // {topicId, cards}
  captionsToggled: make(ActionType.CAPTIONS_TOGGLED),          // big live captions on/off
  languageChanged: make(ActionType.LANGUAGE_CHANGED),          // 'hinglish' | 'english' | 'hindi'
  onboardingSet: make(ActionType.ONBOARDING_SET),              // true: show the first-run guide
  celebrated: make(ActionType.CELEBRATED),                     // {id, text}: a small moment for a win
  viewChanged: make(ActionType.VIEW_CHANGED),                  // 'library' | 'study' | 'progress'
  librarySearched: make(ActionType.LIBRARY_SEARCHED),          // search text typed in the notes library
  documentToggled: make(ActionType.DOCUMENT_TOGGLED),          // documentId: collapse/expand its topic list
  themeChanged: make(ActionType.THEME_CHANGED),                // 'system' | 'light' | 'dark'
};
