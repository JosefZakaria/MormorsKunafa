self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const ADMIN_FALLBACK_URL = '/admin/dashboard';

async function notifyPendingOrders() {
  try {
    // Push is only a wakeup. Never trust its account, text or navigation data,
    // including delayed payloads from an older server version.
    const response = await fetch('/api/admin/notifications/pending', {
      method: 'GET',
      credentials: 'same-origin',
      mode: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.ok) return;
    const pending = await response.json();
    if (pending?.shouldNotify !== true) return;
    await self.registration.showNotification('Ny order', {
      body: 'Det finns beställningar att ta emot',
      tag: 'pending-orders',
      renotify: true,
      requireInteraction: true,
      vibrate: [500, 200, 500, 200, 800],
      data: { url: ADMIN_FALLBACK_URL },
      badge: '/images/logo-icon.png',
      icon: '/images/logo-icon.png',
    });
  } catch {
    // Logged out, unavailable or malformed: the durable dashboard queue remains
    // authoritative; a failed recheck must never produce an OS notification.
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil(notifyPendingOrders());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = ADMIN_FALLBACK_URL;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            client.navigate(target);
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
      return undefined;
    })
  );
});
