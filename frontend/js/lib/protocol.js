// Names shared with the backend (see docs/CODEBASE.md, "WebSocket protocol").

/** Voice connection state shown by the orb. */
export const VOICE_STATUS = Object.freeze({
  IDLE: 'idle', CONNECTING: 'connecting', LISTENING: 'listening', SPEAKING: 'speaking',
});

/** JSON messages the server sends on /ws/voice. */
export const SERVER_EVENT = Object.freeze({
  TRANSCRIPT: 'transcript', EMOTION: 'emotion', PHASE: 'phase', QUIZ_QUESTION: 'quiz_question',
  TEST_SUMMARY: 'test_summary', MASTERY: 'mastery', MISSION: 'mission',
  INTERRUPTED: 'interrupted', TURN_COMPLETE: 'turn_complete', ERROR: 'error',
});

/** What the tutor does when a session starts. */
export const SESSION_MODE = Object.freeze({ FREE: 'free', LEARN: 'learn', TEST: 'test' });
