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

async function request(path, { method = 'GET', json, form } = {}) {
  const options = { method, headers: {} };
  const token = getToken();
  if (token) options.headers.authorization = `Bearer ${token}`;
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
