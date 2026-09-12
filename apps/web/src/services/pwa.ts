export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error) => console.error('[PWA] service worker register failed', error));
  });
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export type AdminPushState = 'unsupported' | 'unconfigured' | 'denied' | 'available' | 'enabled';

function publicVapidKey(): string {
  return String(import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY ?? '').trim();
}

export function supportsAdminPush(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export async function getAdminPushState(): Promise<AdminPushState> {
  if (!supportsAdminPush()) return 'unsupported';
  if (!publicVapidKey()) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'enabled' : 'available';
}

/** Browser permission must only be requested from an explicit staff action. */
export async function enableAdminPush(): Promise<PushSubscription> {
  if (!supportsAdminPush()) throw new Error('Push stöds inte av den här webbläsaren.');
  const vapidKey = publicVapidKey();
  if (!vapidKey) throw new Error('Push är inte konfigurerat för den här webbversionen.');

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Pushbehörighet nekades. Tillåt aviseringar i Androids webbplatsinställningar.');
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
  });
}
