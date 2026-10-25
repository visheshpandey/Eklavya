// HTTP access to the backend. Gemini is called by the backend only; the browser never sees a key.
import { API_BASE } from '../lib/config.js';

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

  if (!response.ok) {
    throw new ApiError(data?.error || `Request failed (${response.status})`,
      { status: response.status, code: data?.code || 'http_error', fields: data?.fields ?? null });
  }
  if (data === null) throw new ApiError('The server sent an unreadable response.', { status: response.status, code: 'bad_response' });
  return data;
}

/** One method per backend endpoint. */
export const backend = {
  dashboard: (userId) => request(`/api/dashboard?user_id=${userId}`),
  topic: (topicId, userId) => request(`/api/topics/${topicId}?user_id=${userId}`),
  deleteDocument: (documentId, userId) => request(`/api/documents/${documentId}?user_id=${userId}`, { method: 'DELETE' }),
  seedDemo: (userId) => request(`/api/demo/seed?user_id=${userId}`, { method: 'POST' }),
  uploadDocument: (file, userId) => {
    const form = new FormData();
    form.append('user_id', String(userId));
    form.append('file', file);
    return request('/api/upload-document', { method: 'POST', form });
  },
};
