// ═══════════════════════════════════════════════
// AllNet — Service Worker (Push Notifications)
// ═══════════════════════════════════════════════

self.addEventListener('install', (event) => {
  console.log('AllNet SW: installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('AllNet SW: activated');
  event.waitUntil(self.clients.claim());
});

// ── Handle incoming push messages ──
self.addEventListener('push', (event) => {
  console.log('AllNet SW: push received');

  let data = { title: 'AllNet', body: 'A court you watch is active!', courtId: null };

  if (event.data) {
    try {
      data = Object.assign(data, event.data.json());
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/img/icon-192.png',
    badge: '/img/icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.courtId ? `court-${data.courtId}` : 'allnet-alert',
    renotify: true,
    data: {
      courtId: data.courtId,
      url: data.url || '/allnet-app.html'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── Handle notification tap — open the court on the map ──
self.addEventListener('notificationclick', (event) => {
  console.log('AllNet SW: notification clicked');
  event.notification.close();

  const courtId = event.notification.data?.courtId;
  const baseUrl = event.notification.data?.url || '/allnet-app.html';
  const targetUrl = courtId ? `${baseUrl}?court=${courtId}` : baseUrl;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If AllNet is already open, focus it and navigate
      for (const client of clients) {
        if (client.url.includes('allnet-app') && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'OPEN_COURT', courtId });
          return;
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
