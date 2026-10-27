// Service worker: lets the app be installed and open without a network.
// Same-origin page files: network first (always the newest code when online), the cached copy when offline.
// The backend API (another origin) and the voice WebSocket are never cached: answers must be live.
const CACHE = 'eklavya-shell-v2';
const SHELL = ['./', './index.html', './config.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png',
  './css/tokens.css', './css/base.css', './css/layout.css', './css/components.css', './css/skin.css', './fonts/geist.woff2', './css/print.css', './js/main.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request)
    .then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })
    .catch(() => caches.match(event.request).then((hit) => hit ?? caches.match('./index.html'))));
});
