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
  viewChanged: make(ActionType.VIEW_CHANGED),                  // 'library' | 'study' | 'progress'
  librarySearched: make(ActionType.LIBRARY_SEARCHED),          // search text typed in the notes library
  documentToggled: make(ActionType.DOCUMENT_TOGGLED),          // documentId: collapse/expand its topic list
  themeChanged: make(ActionType.THEME_CHANGED),                // 'system' | 'light' | 'dark'
};
