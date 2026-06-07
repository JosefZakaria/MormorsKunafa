import webpush from 'web-push';
import {
  createPushDeliveryLog,
  disablePushSubscriptionByEndpoint,
  hasPushDeliveryLog,
  listActivePushSubscriptions,
  markPushDeliveryFailure,
  markPushDeliverySuccess,
} from '../db/pushSubscriptionsRepository.js';
import type { OrderCreatedEvent } from './realtimeEvents.js';

const deliveredInRuntime = new Map<string, Set<string>>();

function setRuntimeDelivered(eventId: string, subscriptionId: string): void {
  if (!deliveredInRuntime.has(eventId)) {
    deliveredInRuntime.set(eventId, new Set<string>());
    if (deliveredInRuntime.size > 500) {
      const oldest = deliveredInRuntime.keys().next().value;
      if (oldest) deliveredInRuntime.delete(oldest);
    }
  }
  deliveredInRuntime.get(eventId)?.add(subscriptionId);
}

function hasRuntimeDelivered(eventId: string, subscriptionId: string): boolean {
  return deliveredInRuntime.get(eventId)?.has(subscriptionId) ?? false;
}

let vapidConfigured = false;

export function configureWebPush(): void {
  if (vapidConfigured) return;
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_SUBJECT?.trim() || 'mailto:admin@mormorskunafa.se';

  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID keys missing; Web Push disabled');
    return;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  } catch (error: any) {
    console.error('[push] Failed to configure Web Push VAPID details:', error?.message || error);
    vapidConfigured = false;
  }
}

export function isWebPushConfigured(): boolean {
  return vapidConfigured;
}

export async function sendOrderCreatedPush(event: OrderCreatedEvent): Promise<void> {
  if (!vapidConfigured) return;

  const subscriptions = await listActivePushSubscriptions();
  if (!subscriptions.length) return;

  const payload = JSON.stringify({
    event_id: event.event_id,
    event_type: event.event_type,
    order_id: event.order_id,
    order_number: event.order_number,
    created_at: event.created_at,
    title: 'Ny order',
    body: `Order ${event.order_number} har kommit in`,
    url: `/admin/dashboard?orderId=${encodeURIComponent(event.order_id)}`,
    tag: `order-${event.order_id}`,
  });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      if (hasRuntimeDelivered(event.event_id, subscription.id)) {
        return;
      }

      const alreadyLogged = await hasPushDeliveryLog(event.event_id, subscription.id);
      if (alreadyLogged) {
        setRuntimeDelivered(event.event_id, subscription.id);
        return;
      }

      const target = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      };

      try {
        await webpush.sendNotification(target, payload, {
          TTL: 60,
          urgency: 'high',
        });

        setRuntimeDelivered(event.event_id, subscription.id);
        await markPushDeliverySuccess(subscription.id);
        await createPushDeliveryLog({
          eventId: event.event_id,
          subscriptionId: subscription.id,
          status: 'success',
          statusCode: 201,
        });
      } catch (error: any) {
        const statusCode = Number(error?.statusCode ?? 0) || undefined;
        const message = String(error?.body || error?.message || 'push failed');
        await markPushDeliveryFailure(subscription.id, message, statusCode);
        await createPushDeliveryLog({
          eventId: event.event_id,
          subscriptionId: subscription.id,
          status: 'failed',
          statusCode,
          errorMessage: message,
        });

        if (statusCode === 404 || statusCode === 410) {
          await disablePushSubscriptionByEndpoint(subscription.endpoint);
        }
      }
    })
  );
}
