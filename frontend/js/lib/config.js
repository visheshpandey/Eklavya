// Reads config.js (window.APP_CONFIG) once. Nothing else in the app reads globals or the URL.
const g = globalThis;
const configured = g.APP_CONFIG ?? {};
const params = new URLSearchParams(g.location?.search ?? '');
const isLocalHost = ['localhost', '127.0.0.1', ''].includes(g.location?.hostname ?? '');

/** Backend base URL, without a trailing slash. ?api=... beats config.js beats the default. */
export const API_BASE = (params.get('api')
  || configured.apiBase
  || (isLocalHost ? 'http://localhost:5000' : g.location?.origin ?? '')).replace(/\/$/, '');

export const WS_BASE = API_BASE.replace(/^http/, 'ws');
export const USER_ID = Number(configured.userId ?? 1);
