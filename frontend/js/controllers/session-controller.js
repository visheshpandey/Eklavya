// The voice session: starts/stops it and turns each server event into a state change.
// No DOM in here; the components render whatever the store says.
import { actions } from '../state/actions.js';
import { SERVER_EVENT as EVENT, SESSION_MODE, VOICE_STATUS } from '../lib/protocol.js';
import { round1 } from '../lib/format.js';
import { t } from '../lib/strings.js';

/** Server events carry `type`; state keeps only the payload. */
const stripType = ({ type: _type, ...rest }) => rest;

/**
 * @param {object} deps
 * @param {*} deps.store
 * @param {ReturnType<typeof import('./notes-controller.js').createNotesController>} deps.notes
 * @param {ReturnType<typeof import('./notifier.js').createNotifier>} deps.notifier
 * @param {() => string} deps.getLanguage current value of the language selector
 * @param {number} deps.userId
 * @param {() => void} [deps.onProgress] answers or results changed: refresh Today, plan, map and history
 * @param {(file: File) => Promise<{mime: string, data: string, previewUrl: string}>} [deps.preparePhoto] shrinks a photo
 */
export function createSessionController({ store, notes, notifier, getLanguage, getTutor = () => 'mentor', userId, onProgress = () => {}, preparePhoto }) {
  let voice = null;   // set by attach(); the VoiceClient needs this controller's handlers, so it is created after
  let celebrationId = 0;
  let lastStart = null;     // what to start again after a drop: {mode, topicId, debate}
  let unconfirmed = null;   // the last answer sent that nothing has answered yet: sent again after a reconnect if it is still awaited
  let queued = null;        // an answer typed or tapped while the call was down: sent as soon as it is back
  const language = () => store.getState().ui.language;
  const errorText = (code) => { const text = t(`err.${code}`, language()); return text.startsWith('err.') ? t('err.generic', language()) : text; };

  /** Is the tutor waiting for an answer right now: an open quiz question, a viva question, or a debate in progress? */
  function awaitingAnswer() {
    const { session } = store.getState();
    if (session.question && !session.result) return true;
    const viva = session.viva;
    if (viva?.question && (viva.marks?.length ?? 0) < (viva.number ?? 1)) return true;
    return session.mode === SESSION_MODE.DEBATE;
  }

  const active = () => voice.status !== VOICE_STATUS.IDLE;

  function handleStatus(status) {
    store.dispatch(actions.voiceStatusChanged(status));
  }

  function handleEvent(event) {
    switch (event.type) {
      case EVENT.TRANSCRIPT:
        store.dispatch(actions.transcriptReceived({ role: event.role === 'user' ? 'user' : 'tutor', text: event.text, final: Boolean(event.final), replace: Boolean(event.replace) }));
        break;
      case EVENT.INTERRUPTED: store.dispatch(actions.turnInterrupted()); break;
      case EVENT.RECONNECTING: notifier.info(t('conn.reconnecting', language())); break;   // the server is retrying by itself
      case EVENT.SESSION: break;                                                        // the voice client keeps the id for resuming
      case EVENT.CONNECTION_LOST:
        store.dispatch(actions.connectionLost({ code: 'upstream_unavailable', retryable: true }));
        break;
      case EVENT.EMOTION: store.dispatch(actions.emotionReported(event)); break;
      case EVENT.PHASE: store.dispatch(actions.phaseChanged(event)); break;
      case EVENT.QUIZ_QUESTION: store.dispatch(actions.questionAsked(event)); break;
      case EVENT.TEST_SUMMARY: store.dispatch(actions.testSummarized(event)); break;
      case EVENT.BOARD: store.dispatch(actions.boardShown(stripType(event))); break;
      case EVENT.MASTERY:
        unconfirmed = null;
        store.dispatch(actions.answerGraded(event));
        notifier.toast(event.is_correct ? 'ok' : 'bad', `${event.topic}: ${event.before}% → ${event.after}%`);
        if (event.is_correct && event.after > event.before) celebrate(event.topic, event.after - event.before);
        notes.refresh();
        onProgress();
        break;
      case EVENT.VIVA_QUESTION: store.dispatch(actions.vivaQuestionAsked(stripType(event))); break;
      case EVENT.VIVA_MARK:
        unconfirmed = null;
        store.dispatch(actions.vivaMarked(stripType(event)));
        notes.refresh();
        break;
      case EVENT.VIVA_REPORT:
        store.dispatch(actions.vivaReported(stripType(event)));
        onProgress();
        break;
      case EVENT.DEBATE_SCORE: unconfirmed = null; store.dispatch(actions.debateScored(stripType(event))); break;
      case EVENT.DEBATE_VERDICT:
        store.dispatch(actions.debateJudged(stripType(event)));
        if (event.winner === 'student') celebrate(null, 0, t('debate.youWon', language()));
        onProgress();
        break;
      case EVENT.MISSION:
        store.dispatch(actions.missionReceived(event));
        notes.refresh();
        break;
      case EVENT.TURN_COMPLETE: notes.refresh(); break;
      case EVENT.ERROR:   // the server sends a code; the words come from here, in the student's language, never from the provider
        voice.stop();
        if (event.retryable) store.dispatch(actions.connectionLost({ code: event.code, retryable: true }));
        else notifier.error(new Error(errorText(event.code)));
        break;
      default: break;   // unknown events are ignored so a newer server never breaks an older page
    }
  }

  /** A small, honest moment for a win: mastery went up, or a debate was won. */
  function celebrate(topic, delta, text) {
    store.dispatch(actions.celebrated({ id: ++celebrationId, text: text ?? t('celebrate.mastery', language(), { topic, n: round1(delta) }) }));
  }

  /** Start a session. `topicId` is required for every mode except free; `debate` is {side, motion, style} for debates. */
  async function start(mode = SESSION_MODE.FREE, topicId = null, debate = {}) {
    if (active()) voice.stop();
    store.dispatch(actions.sessionStarted({ mode, topicId }));
    lastStart = { mode, topicId, debate };
    unconfirmed = queued = null;
    try {
      await voice.start({ userId, lang: getLanguage(), mode, topicId, side: debate.side, motion: debate.motion, style: debate.style, tutor: getTutor() });
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
    sendText(text) {
      if (voice.sendText(text) === false) {   // not connected: keep it and send it after Reconnect, so the answer is not lost
        queued = text;
        notifier.info(t('conn.queued', language()));
        return;
      }
      unconfirmed = text;
    },

    /** Pick the dropped call up again: the quiz, viva or debate on screen stays, and the server restores where it was. */
    async reconnect() {
      if (!lastStart || active()) return;
      store.dispatch(actions.sessionResumed());
      try {
        await voice.start({ userId, lang: getLanguage(), mode: lastStart.mode, topicId: lastStart.topicId, side: lastStart.debate.side,
          motion: lastStart.debate.motion, style: lastStart.debate.style, tutor: getTutor(), resume: true });
      } catch (err) {
        store.dispatch(actions.connectionLost({ code: 'upstream_unavailable', retryable: true }));
        notifier.error(err);
        return;
      }
      const again = queued ?? (unconfirmed && awaitingAnswer() ? unconfirmed : null);   // the answer that never got through
      queued = null;
      if (again) { voice.sendText(again); unconfirmed = again; }
    },

    /** Snap a doubt: shrink the photo, show it in the conversation, send it to Eklavya. */
    async sendPhoto(file) {
      if (!active()) { notifier.info(t('photo.noCall', language())); return false; }
      try {
        const photo = await preparePhoto(file);
        if (!voice.sendPhoto(photo)) { notifier.info(t('photo.noCall', language())); return false; }
        store.dispatch(actions.transcriptReceived({ role: 'user', text: t('photo.sent', language()), final: true, image: photo.previewUrl }));
        return true;
      } catch (err) {
        notifier.error(err);
        return false;
      }
    },
  };
}
