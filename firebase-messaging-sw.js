/* Firebase Cloud Messaging: recebe avisos quando o app está fechado. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDD8Uco12pmiuR68h9Icu9kkCBfGxaCcy8',
  authDomain: 'cozinha-1cc2b.firebaseapp.com',
  databaseURL: 'https://cozinha-1cc2b-default-rtdb.firebaseio.com',
  projectId: 'cozinha-1cc2b',
  storageBucket: 'cozinha-1cc2b.firebasestorage.app',
  messagingSenderId: '562356930407',
  appId: '1:562356930407:web:2e8ec01c317529480791c2'
});

firebase.messaging();

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification?.data?.url || './';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const opened = windows.find(client => 'focus' in client);
    return opened ? opened.focus() : clients.openWindow(target);
  }));
});
