// Wake the server the instant the page opens (a classic script, so it runs before the app's modules load). A file, not an inline
// script, so the Content-Security-Policy in vercel.json needs no exception for it.
fetch(window.APP_CONFIG.apiBase + '/api/health', { cache: 'no-store' }).catch(function () {});
