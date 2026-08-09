self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const ADMIN_FALLBACK_URL = '/admin/dashboard';

function boundedNotificationText(value, fallback, maxLength) {
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
  return (text || fallback).slice(0, maxLength);
}

function safeAdminTarget(value) {
  if (typeof value !== 'string' || !value) return ADMIN_FALLBACK_URL;
  try {
    const target = new URL(value, self.location.origin);
    if (target.origin !== self.location.origin) return ADMIN_FALLBACK_URL;
    if (target.pathname !== '/admin' && !target.pathname.startsWith('/admin/')) {
      return ADMIN_FALLBACK_URL;
    }
    return `${target.pathname}${target.search}`;
  } catch {
    return ADMIN_FALLBACK_URL;
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = boundedNotificationText(data.title, 'Ny order', 80);
  const body = boundedNotificationText(data.body, 'En ny bestallning har kommit in', 240);
  const orderId = typeof data.order_id === 'string' ? data.order_id.slice(0, 128) : null;
  const targetUrl = safeAdminTarget(data.url);
  const tag = boundedNotificationText(
    data.tag,
    orderId ? `order-${orderId}` : 'new-order',
    160
  );

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      data: {
        orderId,
        url: targetUrl,
      },
      badge: '/images/logo-icon.png',
      icon: '/images/logo-icon.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = safeAdminTarget(data.url);

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
