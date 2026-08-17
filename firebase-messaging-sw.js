/* Web Push gratuito + abertura básica offline. */
const CACHE = 'cozinhaflow-shell-v6';
const SHELL = ['./','./index.html','./manifest.webmanifest','./app-icon-192.png','./app-icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => null).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('cozinhaflow-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html'))));
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json?.() || {}; } catch { payload = { body: event.data?.text?.() || '' }; }
  const title = payload.title || 'CozinhaFlow';
  const options = {
    body: payload.body || 'Você recebeu uma atualização.',
    icon: payload.icon || './app-icon-192.png',
    badge: payload.badge || './app-icon-192.png',
    tag: payload.tag || 'cozinhaflow',
    data: payload.data || { url: './' },
    vibrate: [120, 60, 120],
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification?.data?.url || './';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const opened = windows.find(client => 'focus' in client);
    return opened ? opened.focus() : clients.openWindow(target);
  }));
});
