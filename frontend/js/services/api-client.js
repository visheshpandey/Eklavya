// HTTP access to the backend. Gemini is called by the backend only; the browser never sees a key.
import { API_BASE } from '../lib/config.js';
import { getToken, signOut } from '../lib/session.js';

/** Any failed request. `code` is the backend's machine code ("not_found", "llm_unavailable", ...) or "network". */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'error', fields = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/** The browser's timezone, e.g. "Asia/Kolkata". */
function timezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
}

async function request(path, { method = 'GET', json, form } = {}) {
  const options = { method, headers: {} };
  const token = getToken();
  if (token) options.headers.authorization = `Bearer ${token}`;
  options.headers['x-timezone'] = timezone();   // "today" and streaks follow the student's own calendar
  if (json) { options.headers['content-type'] = 'application/json'; options.body = JSON.stringify(json); }
  if (form) options.body = form;

  let response;
  try {
    response = await fetch(API_BASE + path, options);
  } catch {
    throw new ApiError(`Cannot reach the backend at ${API_BASE}. Is it running?`, { code: 'network' });
  }

  let data = null;
  try { data = await response.json(); } catch { /* body was not JSON */ }

  if (response.status === 401 && token && !path.startsWith('/api/auth/')) {   // an expired or invalid login: back to the login screen
    signOut();
    globalThis.location?.reload();
  }
  if (!response.ok) {
    throw new ApiError(data?.error || `Request failed (${response.status})`,
      { status: response.status, code: data?.code || 'http_error', fields: data?.fields ?? null });
  }
  if (data === null) throw new ApiError('The server sent an unreadable response.', { status: response.status, code: 'bad_response' });
  return data;
}

/** One method per backend endpoint. */
export const backend = {
  signup: (body) => request('/api/auth/signup', { method: 'POST', json: body }),
  login: (body) => request('/api/auth/login', { method: 'POST', json: body }),
  me: () => request('/api/auth/me'),
  authConfig: () => request('/api/auth/config'),
  google: (credential) => request('/api/auth/google', { method: 'POST', json: { credential } }),
  forgotPassword: (email) => request('/api/auth/forgot', { method: 'POST', json: { email } }),
  resetPassword: (token, password) => request('/api/auth/reset', { method: 'POST', json: { token, password } }),
  changePassword: (currentPassword, newPassword) => request('/api/auth/password', { method: 'POST', json: { current_password: currentPassword, new_password: newPassword } }),
  deleteAccount: (password, confirm) => request('/api/auth/delete', { method: 'POST', json: { password, confirm } }),
  reminders: () => request('/api/reminders'),
  saveReminders: (changes) => request('/api/reminders', { method: 'PUT', json: changes }),
  pushSubscribe: (subscription) => request('/api/push/subscribe', { method: 'POST', json: subscription }),
  pushUnsubscribe: (subscription) => request('/api/push/unsubscribe', { method: 'POST', json: subscription }),
  testReminder: () => request('/api/reminders/test', { method: 'POST' }),
  dueCards: () => request('/api/flashcards/due'),
  reviewCard: (cardId, knew, hard = false) => request(`/api/flashcards/${cardId}/review`, { method: 'POST', json: { knew, hard } }),
  resetDeck: () => request('/api/flashcards/reset', { method: 'POST' }),
  importLink: (url) => request('/api/import-link', { method: 'POST', json: { url } }),
  ask: (question, language) => request('/api/tutor/ask', { method: 'POST', json: { question, language } }),
  doubts: (query = '') => request(`/api/doubts${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  deleteDoubt: (id) => request(`/api/doubts/${id}`, { method: 'DELETE' }),
  clearDoubts: () => request('/api/doubts', { method: 'DELETE' }),
  startMockExam: (count, minutes) => request('/api/mock-exam/start', { method: 'POST', json: { count, minutes } }),
  submitMockExam: (examId, answers) => request(`/api/mock-exam/${examId}/submit`, { method: 'POST', json: { answers } }),
  mockExams: () => request('/api/mock-exams'),
  badges: () => request('/api/badges'),
  groups: () => request('/api/groups'),
  createGroup: (name) => request('/api/groups', { method: 'POST', json: { name } }),
  joinGroup: (code) => request('/api/groups/join', { method: 'POST', json: { code } }),
  group: (id) => request(`/api/groups/${id}`),
  leaveGroup: (id) => request(`/api/groups/${id}/members/me`, { method: 'DELETE' }),
  shareNotes: (id, documentId) => request(`/api/groups/${id}/notes`, { method: 'POST', json: { document_id: documentId } }),
  unshareNotes: (id, documentId) => request(`/api/groups/${id}/notes/${documentId}`, { method: 'DELETE' }),
  addSharedNotes: (id, documentId) => request(`/api/groups/${id}/notes/${documentId}/add`, { method: 'POST' }),
  challenges: () => request('/api/challenges'),
  createChallenge: (topicId) => request('/api/challenges', { method: 'POST', json: { topic_id: topicId } }),
  openChallenge: (code) => request(`/api/challenges/${encodeURIComponent(code)}`),
  challengeResult: (code) => request(`/api/challenges/${encodeURIComponent(code)}/result`),
  playChallenge: (code, answers, seconds) => request(`/api/challenges/${encodeURIComponent(code)}/play`, { method: 'POST', json: { answers, seconds } }),
  dashboard: (userId) => request(`/api/dashboard?user_id=${userId}`),
  topic: (topicId, userId) => request(`/api/topics/${topicId}?user_id=${userId}`),
  deleteDocument: (documentId, userId) => request(`/api/documents/${documentId}?user_id=${userId}`, { method: 'DELETE' }),
  seedDemo: (userId) => request(`/api/demo/seed?user_id=${userId}`, { method: 'POST' }),
  today: (userId) => request(`/api/today?user_id=${userId}`),
  boardsToday: (userId) => request(`/api/boards?user_id=${userId}`),
  history: (userId) => request(`/api/history?user_id=${userId}`),
  plan: (userId) => request(`/api/plan?user_id=${userId}`),
  savePlan: (examDate, minutesPerDay, userId) => request('/api/plan', { method: 'PUT', json: { user_id: userId, exam_date: examDate, minutes_per_day: minutesPerDay } }),
  clearPlan: (userId) => request(`/api/plan?user_id=${userId}`, { method: 'DELETE' }),
  conceptMap: (userId) => request(`/api/concept-map?user_id=${userId}`),
  demoCircle: () => request('/api/demo/circle'),
  masteryHistory: (userId) => request(`/api/mastery-history?user_id=${userId}`),
  flashcards: (topicId, userId) => request(`/api/flashcards?user_id=${userId}${topicId ? `&topic_id=${topicId}` : ''}`),
  makeFlashcards: (topicId, userId) => request('/api/flashcards/generate', { method: 'POST', json: { user_id: userId, topic_id: topicId } }),
  /** A PDF, a text file, or a photo of a page (the backend has Gemini read the photo). */
  uploadDocument: (file, userId) => {
    const form = new FormData();
    form.append('user_id', String(userId));
    form.append('file', file);
    return request('/api/upload-document', { method: 'POST', form });
  },
};
