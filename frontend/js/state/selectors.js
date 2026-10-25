// Read-only views of the state. Components select slices with these so they re-render only when needed.
import { VOICE_STATUS } from '../lib/protocol.js';

export const selectVoiceStatus = (s) => s.voiceStatus;
export const selectSessionActive = (s) => s.voiceStatus !== VOICE_STATUS.IDLE;
export const selectTextInputEnabled = (s) => s.voiceStatus === VOICE_STATUS.LISTENING || s.voiceStatus === VOICE_STATUS.SPEAKING;
export const selectDashboard = (s) => s.dashboard;
export const selectSelectedTopicId = (s) => s.selectedTopicId;
export const selectTopicDetail = (s) => s.topicDetail;
export const selectMission = (s) => s.mission;
export const selectBanner = (s) => s.banner;
export const selectToasts = (s) => s.toasts;
export const selectMessages = (s) => s.session.messages;
export const selectPhase = (s) => s.session.phase;
export const selectEmotion = (s) => s.session.emotion;
export const selectQuestion = (s) => s.session.question;
export const selectResult = (s) => s.session.result;
export const selectSummary = (s) => s.session.summary;
