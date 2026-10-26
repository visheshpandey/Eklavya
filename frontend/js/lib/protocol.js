// Names shared with the backend (see docs/CODEBASE.md, "WebSocket protocol").

/** Voice connection state shown by the orb. */
export const VOICE_STATUS = Object.freeze({
  IDLE: 'idle', CONNECTING: 'connecting', LISTENING: 'listening', SPEAKING: 'speaking',
});

/** JSON messages the server sends on /ws/voice. */
export const SERVER_EVENT = Object.freeze({
  TRANSCRIPT: 'transcript', EMOTION: 'emotion', PHASE: 'phase', QUIZ_QUESTION: 'quiz_question',
  TEST_SUMMARY: 'test_summary', MASTERY: 'mastery', MISSION: 'mission',
  BOARD: 'board', VIVA_QUESTION: 'viva_question', VIVA_MARK: 'viva_mark', VIVA_REPORT: 'viva_report',
  DEBATE_SCORE: 'debate_score', DEBATE_VERDICT: 'debate_verdict',
  INTERRUPTED: 'interrupted', TURN_COMPLETE: 'turn_complete', ERROR: 'error',
});

/** What the tutor does when a session starts. REVISE: 5-minute spaced revision. VIVA: oral exam with marks.
 * DEBATE: the student argues against the tutor on a topic. */
export const SESSION_MODE = Object.freeze({ FREE: 'free', LEARN: 'learn', TEST: 'test', REVISE: 'revise', VIVA: 'viva', DEBATE: 'debate' });

/** Tutor languages (the selector in the top bar); the interface itself is shown in English or Hindi. */
export const LANGUAGES = Object.freeze({ HINGLISH: 'hinglish', ENGLISH: 'english', HINDI: 'hindi' });
