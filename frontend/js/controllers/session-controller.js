// The voice session: starts/stops it and turns each server event into a state change.
// No DOM in here; the components render whatever the store says.
//
// A call that is slow, stalls or has no microphone never leaves the student staring at nothing: it falls back to text mode (the same
// lesson and test through the ordinary endpoints, see text-session.js), and the reply bubble is filled from the notes if Gemini's words
// do not arrive.
import { actions } from '../state/actions.js';
import { SERVER_EVENT as EVENT, SESSION_MODE, VOICE_STATUS } from '../lib/protocol.js';
import { round1 } from '../lib/format.js';
import { t } from '../lib/strings.js';
import { firstLine } from '../lib/voice-phase.js';
import { selectDashboard, selectTopicDetail } from '../state/selectors.js';
import { createReplyWatchdog } from '../lib/reply-watchdog.js';
import { createAutoAdvance } from '../lib/auto-advance.js';
import { cancel as defaultCancel, schedule as defaultSchedule } from '../lib/timers.js';
import { createTextSession, letterFrom } from './text-session.js';
import { ignoreSpokenLine } from '../lib/echo-guard.js';

/** Server events carry `type`; state keeps only the payload. */
const stripType = ({ type: _type, ...rest }) => rest;

const FOCUSED = new Set([SESSION_MODE.LEARN, SESSION_MODE.TEST, SESSION_MODE.REVISE]);   // the modes with a graded test
const TEXT_MODE_NOTICE = {
  slow: 'Voice is slow right now, switching to text mode.',
  stalled: 'Voice is not answering, switching to text mode.',
  mic: 'The microphone is not available, so we will carry on in text.',
};

/**
 * @param {object} deps
 * @param {*} deps.store
 * @param {ReturnType<typeof import('./notes-controller.js').createNotesController>} deps.notes
 * @param {ReturnType<typeof import('./notifier.js').createNotifier>} deps.notifier
 * @param {() => string} deps.getLanguage current value of the language selector
 * @param {number} deps.userId
 * @param {() => void} [deps.onProgress] answers or results changed: refresh Today, plan, map and history
 * @param {(file: File) => Promise<{mime: string, data: string, previewUrl: string}>} [deps.preparePhoto] shrinks a photo
 * @param {{ask: Function, quizGenerate: Function, quizSubmit: Function}} [deps.backend] the ordinary endpoints; without it there is no text-mode fallback
 */
export function createSessionController({ store, notes, notifier, getLanguage, getTutor = () => 'mentor', userId, onProgress = () => {}, preparePhoto,
  backend = null, schedule = defaultSchedule, cancel = defaultCancel, now = () => Date.now(), connectMs = 10000, answerMs = 12000, advanceMs = 3000 }) {
  let voice = null;   // set by attach(); the VoiceClient needs this controller's handlers, so it is created after
  let celebrationId = 0;
  let lastStart = null;     // what to start again after a drop: {mode, topicId, debate}
  let tutorSpokeAt = -Infinity;   // when the tutor's audio last ended: speech heard right after it is probably its own voice
  let unconfirmed = null;   // the last answer sent that nothing has answered yet: sent again after a reconnect if it is still awaited
  let queued = null;        // an answer typed or tapped while the call was down: sent as soon as it is back
  let switching = false;    // the call is being swapped for text mode: its ending is not the end of the session
  let connectTimer = null;
  let answerTimer = null;
  let progress = { asked: [], results: [] };   // what this call has already asked and graded, handed to text mode if it has to take over
  const language = () => store.getState().ui.language;
  const errorText = (code) => { const text = t(`err.${code}`, language()); return text.startsWith('err.') ? t('err.generic', language()) : text; };
  const textMode = () => store.getState().session.live.text;
  const say = (text) => store.dispatch(actions.transcriptReceived({ role: 'tutor', text, final: true }));

  /** Is the tutor waiting for an answer right now: an open quiz question, a viva question, or a debate in progress? */
  function awaitingAnswer() {
    const { session } = store.getState();
    if (session.question && !session.result) return true;
    const viva = session.viva;
    if (viva?.question && (viva.marks?.length ?? 0) < (viva.number ?? 1)) return true;
    return session.mode === SESSION_MODE.DEBATE;
  }

  const active = () => voice.status !== VOICE_STATUS.IDLE;

  function topicName(topicId) {
    if (topicId == null) return '';
    const state = store.getState();
    return (selectDashboard(state)?.mastery ?? []).find((m) => m.topic_id === topicId)?.topic_name ?? (selectTopicDetail(state)?.topic_id === topicId ? selectTopicDetail(state).topic_name : '');
  }

  // ---- text mode and the watchers that lead to it
  const typed = backend ? createTextSession({ store, backend, emit: (event) => handleEvent(event), notifier, getLanguage, delayMs: advanceMs, schedule, cancel }) : null;

  // the reply bubble must never stay empty: if Eklavya's words do not arrive, the notes answer instead
  const watchdog = createReplyWatchdog({ schedule, cancel, onTimeout: (said) => replyTimedOut(said) });

  // after a graded answer the test moves on by itself, but not over the top of Eklavya still talking
  const advancer = createAutoAdvance({ schedule, cancel, delayMs: advanceMs, canAdvance: () => voice.status !== VOICE_STATUS.SPEAKING, advance: nudgeNext });
  function nudgeNext() {
    const { question, result } = store.getState().session;
    if (!question || !result || result.question_id !== question.question_id || !question.total || question.number >= question.total) return;   // already moved on, or that was the last one
    if (active() && !textMode()) voice.nextQuestion();
  }

  function clearTimers() {
    cancel(connectTimer); connectTimer = null;
    cancel(answerTimer); answerTimer = null;
    advancer.disarm();
    watchdog.reset();
  }

  async function replyTimedOut(said) {
    if (!backend || textMode() || !active()) return;
    const { mode, question } = store.getState().session;
    if (FOCUSED.has(mode) && awaitingAnswer() && question) {
      say('Please tap one of the options, or say the full answer.');   // a spoken letter is never graded in a test: it may be the tutor's own voice
      return;
    }
    try { say((await backend.ask(said, getLanguage())).answer); }
    catch { say('I could not get my answer out just now. Please ask again in a moment.'); }
  }

  /** Swap the call for text mode and carry on from where it was. Returns false if there is no text mode to go to. */
  async function fallbackToText(reason, { thenAnswer = null } = {}) {
    if (!typed || textMode()) return false;
    clearTimers();
    const { mode, topicId, phase } = store.getState().session;
    switching = true;
    try { if (active()) voice.stop(); } finally { switching = false; }
    store.dispatch(actions.textModeStarted());                            // first: so nothing treats the next line as a call that just began
    store.dispatch(actions.voiceStatusChanged(VOICE_STATUS.LISTENING));   // the room stays open: the student can type
    if (phase) store.dispatch(actions.phaseChanged(phase));
    notifier.info(TEXT_MODE_NOTICE[reason] ?? TEXT_MODE_NOTICE.slow);
    await typed.begin({ mode, topicId, topic: topicName(topicId), carry: progress });
    if (thenAnswer) await typed.answer(thenAnswer);
    return true;
  }

  function handleStatus(status) {
    if (status !== VOICE_STATUS.SPEAKING && voice?.status === VOICE_STATUS.SPEAKING) tutorSpokeAt = now();
    if (switching && status === VOICE_STATUS.IDLE) return;   // swapping the call for text mode: the session goes on
    store.dispatch(actions.voiceStatusChanged(status));
  }

  function handleEvent(event) {
    switch (event.type) {
      case EVENT.TRANSCRIPT:
        if (event.role === 'user' && !textMode()) {   // heard (not typed) while the tutor speaks: its own voice through the speakers, not the student
          const { session } = store.getState();
          const lastTutor = [...session.messages].reverse().find((m) => m.role === 'tutor')?.text ?? '';
          if (ignoreSpokenLine({ testOpen: FOCUSED.has(session.mode) && Boolean(session.question), speaking: voice?.status === VOICE_STATUS.SPEAKING,
            msSinceSpeech: now() - tutorSpokeAt, text: event.text, lastTutorText: lastTutor })) break;
        }
        store.dispatch(actions.transcriptReceived({ role: event.role === 'user' ? 'user' : 'tutor', text: event.text, final: Boolean(event.final), replace: Boolean(event.replace) }));
        if (!textMode()) {
          if (event.role === 'user') { if (event.final && event.text) watchdog.userSpoke(event.text); }
          else if (event.text) watchdog.replied();
        }
        break;
      case EVENT.INTERRUPTED: store.dispatch(actions.turnInterrupted()); break;
      case EVENT.RECONNECTING: notifier.info(t('conn.reconnecting', language())); break;   // the server is retrying by itself
      case EVENT.SESSION:                                                                // the Gemini link is up (the voice client also keeps the id for resuming)
        cancel(connectTimer); connectTimer = null;
        store.dispatch(actions.liveReady());
        break;
      case EVENT.CONNECTION_LOST:
        store.dispatch(actions.connectionLost({ code: 'upstream_unavailable', retryable: true }));
        break;
      case EVENT.EMOTION: store.dispatch(actions.emotionReported(event)); break;
      case EVENT.PHASE: store.dispatch(actions.phaseChanged(event)); break;
      case EVENT.QUIZ_QUESTION:
        advancer.disarm();
        watchdog.replied();
        if (!progress.asked.includes(event.question_id)) progress.asked.push(event.question_id);
        store.dispatch(actions.questionAsked(event));
        break;
      case EVENT.TEST_SUMMARY: watchdog.replied(); store.dispatch(actions.testSummarized(event)); break;
      case EVENT.BOARD: watchdog.replied(); store.dispatch(actions.boardShown(stripType(event))); break;
      case EVENT.MASTERY: {
        unconfirmed = null;
        cancel(answerTimer); answerTimer = null;
        watchdog.replied();
        if (!event.retry) progress.results.push({ question_id: event.question_id, is_correct: event.is_correct, before: event.before, after: event.after,
          misconception: event.misconception?.text ?? null, resolved: event.misconceptions_resolved ? 1 : 0 });
        store.dispatch(actions.answerGraded(event));
        notifier.toast(event.is_correct ? 'ok' : 'bad', `${event.topic}: ${event.before}% → ${event.after}%`);
        if (event.is_correct && event.after > event.before) celebrate(event.topic, event.after - event.before);
        const { session } = store.getState();
        if (!textMode() && FOCUSED.has(session.mode) && session.question?.total) advancer.arm();   // the next question comes by itself, or after 3 s we ask for it
        notes.refresh();
        onProgress();
        break;
      }
      case EVENT.VIVA_QUESTION: watchdog.replied(); store.dispatch(actions.vivaQuestionAsked(stripType(event))); break;
      case EVENT.VIVA_MARK:
        unconfirmed = null;
        watchdog.replied();
        store.dispatch(actions.vivaMarked(stripType(event)));
        notes.refresh();
        break;
      case EVENT.VIVA_REPORT:
        watchdog.replied();
        store.dispatch(actions.vivaReported(stripType(event)));
        onProgress();
        break;
      case EVENT.DEBATE_SCORE: unconfirmed = null; watchdog.replied(); store.dispatch(actions.debateScored(stripType(event))); break;
      case EVENT.DEBATE_VERDICT:
        watchdog.replied();
        store.dispatch(actions.debateJudged(stripType(event)));
        if (event.winner === 'student') celebrate(null, 0, t('debate.youWon', language()));
        onProgress();
        break;
      case EVENT.MISSION:
        watchdog.replied();
        store.dispatch(actions.missionReceived(event));
        notes.refresh();
        break;
      case EVENT.TURN_COMPLETE: watchdog.turnComplete(); notes.refresh(); break;
      case EVENT.ERROR:   // the server sends a code; the words come from here, in the student's language, never from the provider
        clearTimers();
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
    clearTimers();
    typed?.stop();
    if (active()) voice.stop();
    store.dispatch(actions.sessionStarted({ mode, topicId }));
    // shown at once, in text, while the voice connects; Eklavya's own greeting replaces it when it arrives
    store.dispatch(actions.transcriptReceived({ role: 'tutor', text: firstLine({ mode, language: getLanguage(), topic: topicName(topicId) }), final: true, local: true }));
    lastStart = { mode, topicId, debate };
    unconfirmed = queued = null;
    progress = { asked: [], results: [] };
    try {
      await voice.start({ userId, lang: getLanguage(), mode, topicId, side: debate.side, motion: debate.motion, style: debate.style, tutor: getTutor() });
    } catch (err) {
      if (err?.code === 'mic' && await fallbackToText('mic')) return;   // no microphone (or not allowed): the test still works by typing
      notifier.error(err);
      return;
    }
    // the socket is open; if Eklavya is not really up within `connectMs`, switch to text instead of waiting for ever
    if (!store.getState().session.live.ready && active()) {
      cancel(connectTimer);
      connectTimer = schedule(() => {
        connectTimer = null;
        if (!store.getState().session.live.ready && active() && !textMode()) fallbackToText('slow');
      }, connectMs);
    }
  }

  /** The student tapped an option. In a live call it is sent as text; if nothing grades it in time, text mode grades it. */
  function answer(letter) {
    if (textMode() && typed) return typed.answer(letter);
    const questionId = store.getState().session.question?.question_id;
    controller.sendText(letter);
    cancel(answerTimer);
    answerTimer = schedule(() => {
      answerTimer = null;
      const { result } = store.getState().session;
      if (!active() || textMode() || result?.question_id === questionId) return;
      fallbackToText('stalled', { thenAnswer: letter });
    }, answerMs);
    return undefined;
  }

  const controller = {
    attach(client) { voice = client; },
    handleEvent,
    handleStatus,
    start,
    stop: () => {
      const wasText = textMode();
      clearTimers();
      voice.stop();
      if (wasText) { typed?.stop(); store.dispatch(actions.voiceStatusChanged(VOICE_STATUS.IDLE)); }   // the text session has no call to end: close it here
    },
    toggle: () => (active() ? controller.stop() : start(SESSION_MODE.FREE)),
    sendText(text) {
      if (textMode() && typed) { typed.chat(text); return; }
      if (voice.sendText(text) === false) {   // not connected: keep it and send it after Reconnect, so the answer is not lost
        queued = text;
        notifier.info(t('conn.queued', language()));
        return;
      }
      unconfirmed = text;
    },

    /** An option on the question card was tapped. */
    answer,

    /** "Next question →": now, instead of waiting for the timer. */
    nextQuestion() {
      advancer.disarm();
      if (textMode() && typed) return typed.next();
      if (active()) voice.nextQuestion();   // one click, one question: the server shows it at once; no chat message is sent
      return undefined;
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
      if (!active() || textMode()) { notifier.info(t('photo.noCall', language())); return false; }
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
  return controller;
}
