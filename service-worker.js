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

  let data = { title: 'AllNet', body: 'A court you watch is active!', courtId: null, matchId: null, type: null };

  if (event.data) {
    try {
      data = Object.assign(data, event.data.json());
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const tag = data.matchId ? `spray-${data.matchId}` : (data.courtId ? `court-${data.courtId}` : 'allnet-alert');

  const options = {
    body: data.body,
    icon: '/img/icon-192.png',
    badge: '/img/icon-192.png',
    vibrate: [200, 100, 200],
    tag: tag,
    renotify: true,
    data: {
      courtId: data.courtId,
      matchId: data.matchId,
      type: data.type,
      url: data.url || '/allnet-app.html'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── Handle notification tap ──
self.addEventListener('notificationclick', (event) => {
  console.log('AllNet SW: notification clicked');
  event.notification.close();

  const notifData = event.notification.data || {};
  let targetUrl;

  if (notifData.type === 'post_sprayed' && notifData.matchId) {
    // Spray notification → open activity page with match deep link
    targetUrl = '/allnet-activity.html?match=' + notifData.matchId;
  } else if (notifData.courtId) {
    // Court alert → open map with court deep link
    targetUrl = '/allnet-app.html?court=' + notifData.courtId;
  } else {
    targetUrl = notifData.url || '/allnet-app.html';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If AllNet is already open, focus and navigate
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          client.navigate(targetUrl);
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
