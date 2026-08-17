/* Web Push gratuito: recebe avisos no iPhone, Android e computador. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

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
