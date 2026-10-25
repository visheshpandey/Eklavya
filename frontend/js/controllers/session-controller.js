// The voice session: starts/stops it and turns each server event into a state change.
// No DOM in here; the components render whatever the store says.
import { actions } from '../state/actions.js';
import { SERVER_EVENT as EVENT, SESSION_MODE, VOICE_STATUS } from '../lib/protocol.js';

/**
 * @param {object} deps
 * @param {*} deps.store
 * @param {ReturnType<typeof import('./notes-controller.js').createNotesController>} deps.notes
 * @param {ReturnType<typeof import('./notifier.js').createNotifier>} deps.notifier
 * @param {() => string} deps.getLanguage current value of the language selector
 * @param {number} deps.userId
 */
export function createSessionController({ store, notes, notifier, getLanguage, userId }) {
  let voice = null;   // set by attach(); the VoiceClient needs this controller's handlers, so it is created after

  const active = () => voice.status !== VOICE_STATUS.IDLE;

  function handleStatus(status) {
    store.dispatch(actions.voiceStatusChanged(status));
  }

  function handleEvent(event) {
    switch (event.type) {
      case EVENT.TRANSCRIPT:
        store.dispatch(actions.transcriptReceived({ role: event.role === 'user' ? 'user' : 'tutor', text: event.text, final: Boolean(event.final) }));
        break;
      case EVENT.INTERRUPTED: store.dispatch(actions.turnInterrupted()); break;
      case EVENT.EMOTION: store.dispatch(actions.emotionReported(event)); break;
      case EVENT.PHASE: store.dispatch(actions.phaseChanged(event)); break;
      case EVENT.QUIZ_QUESTION: store.dispatch(actions.questionAsked(event)); break;
      case EVENT.TEST_SUMMARY: store.dispatch(actions.testSummarized(event)); break;
      case EVENT.MASTERY:
        store.dispatch(actions.answerGraded(event));
        notifier.toast(event.is_correct ? 'ok' : 'bad', `${event.topic}: ${event.before}% → ${event.after}%`);
        notes.refresh();
        break;
      case EVENT.MISSION:
        store.dispatch(actions.missionReceived(event));
        notes.refresh();
        break;
      case EVENT.TURN_COMPLETE: notes.refresh(); break;
      case EVENT.ERROR:
        notifier.error(new Error(event.message));
        voice.stop();
        break;
      default: break;   // unknown events are ignored so a newer server never breaks an older page
    }
  }

  /** Start a session. `topicId` is required for learn/test modes. */
  async function start(mode = SESSION_MODE.FREE, topicId = null) {
    if (active()) voice.stop();
    store.dispatch(actions.sessionStarted({ mode, topicId }));
    try {
      await voice.start({ userId, lang: getLanguage(), mode, topicId });
    } catch (err) {
      notifier.error(err);
    }
  }

  return {
    attach(client) { voice = client; },
    handleEvent,
    handleStatus,
    start,
    stop: () => voice.stop(),
    toggle: () => (active() ? voice.stop() : start(SESSION_MODE.FREE)),
    sendText: (text) => voice.sendText(text),
  };
}
