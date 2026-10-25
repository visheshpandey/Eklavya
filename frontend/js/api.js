// Backend access. Gemini is called by the backend only; the browser never sees a key.
const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
export const API_BASE = local ? 'http://localhost:5000' : location.origin;
export const WS_BASE = API_BASE.replace(/^http/, 'ws');

export async function api(path, { method = 'GET', json, form } = {}) {
  const opts = { method };
  if (json) { opts.headers = { 'content-type': 'application/json' }; opts.body = JSON.stringify(json); }
  if (form) opts.body = form;
  let res;
  try { res = await fetch(API_BASE + path, opts); }
  catch { throw new Error('Cannot reach the backend. Is it running on ' + API_BASE + '?'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
  return data;
}
