const CACHE_NAME = 'kfc-football-shell-v1.8.0';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './js/config.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/kfc-app-icon-180.png',
  './icons/kfc-app-icon-192.png',
  './icons/kfc-app-icon-512.png',
  './Main_image.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }),
  );
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'KFC Football Club',
    body: '새로운 소식이 도착했습니다.',
    tag: 'kfc-notification',
    url: './#home',
  };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: './icons/kfc-app-icon-192.png',
      badge: './icons/kfc-app-icon-192.png',
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './#home', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windowClients) => {
        const existingClient = windowClients.find((client) => client.url.startsWith(self.registration.scope));
        if (existingClient) {
          if ('navigate' in existingClient) await existingClient.navigate(targetUrl);
          return existingClient.focus();
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
