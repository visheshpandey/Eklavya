// Service worker: lets the app be installed and open without a network.
// Same-origin page files: network first (always the newest code when online), the cached copy when offline.
// The backend API (another origin) and the voice WebSocket are never cached: answers must be live.
const CACHE = 'eklavya-shell-v3';
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

// Daily study reminders (web push). Works in the browser and in the installed / Play Store app.
self.addEventListener('push', (event) => {
  let message = { title: 'Eklavya', body: 'Time for a short revision.', url: './?view=today' };
  try { message = { ...message, ...event.data.json() }; } catch { /* plain or empty push: keep the default text */ }
  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'eklavya-daily', data: { url: message.url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './?view=today', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    return open ? open.navigate(target).then((client) => client?.focus()) : self.clients.openWindow(target);
  }));
});
