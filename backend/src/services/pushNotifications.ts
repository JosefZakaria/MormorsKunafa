import webpush from 'web-push';
import {
  createPushDeliveryLog,
  disablePushSubscriptionById,
  disablePushSubscriptionByEndpoint,
  hasSuccessfulPushDeliveryLog,
  listActivePushSubscriptions,
  markPushDeliveryFailure,
  markPushDeliverySuccess,
  type PushSubscriptionRow,
} from '../db/pushSubscriptionsRepository.js';
import type { OrderCreatedEvent } from './realtimeEvents.js';
import { loadAdminScopes, orderVisibleToScope } from './locationScope.js';

const PUSH_SOCKET_TIMEOUT_MS = 3000;

export type PushDeliveryOutcome = {
  eligibleCount: number;
  successfulCount: number;
  retryableErrors: string[];
  permanentErrors: string[];
};

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

export async function sendTestPush(subscription: PushSubscriptionRow): Promise<boolean> {
  const eventId = crypto.randomUUID();
  if (!vapidConfigured) {
    console.error('[push] Test notification unavailable: VAPID keys missing', { subscriptionId: subscription.id });
    await markPushDeliveryFailure(subscription.id, 'Web Push is not configured');
    await createPushDeliveryLog({
      eventId,
      subscriptionId: subscription.id,
      status: 'failed',
      errorMessage: 'Web Push is not configured',
    });
    return false;
  }
  const target = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
  try {
    await webpush.sendNotification(target, JSON.stringify({
      title: 'Testnotis från Mormors Kunafa',
      body: 'Notiser fungerar på denna padda.',
      tag: `test-${eventId}`,
      url: '/admin/dashboard',
    }), { TTL: 60, urgency: 'high', timeout: PUSH_SOCKET_TIMEOUT_MS });
    await markPushDeliverySuccess(subscription.id);
    await createPushDeliveryLog({ eventId, subscriptionId: subscription.id, status: 'success', statusCode: 201 });
    return true;
  } catch (error: any) {
    const statusCode = Number(error?.statusCode ?? 0) || undefined;
    const message = String(error?.body || error?.message || 'push failed');
    console.error('[push] test delivery failed', { subscriptionId: subscription.id, statusCode, message });
    await markPushDeliveryFailure(subscription.id, message, statusCode);
    await createPushDeliveryLog({ eventId, subscriptionId: subscription.id, status: 'failed', statusCode, errorMessage: message });
    if (statusCode === 404 || statusCode === 410) await disablePushSubscriptionByEndpoint(subscription.endpoint);
    return false;
  }
}

export async function sendOrderCreatedPush(event: OrderCreatedEvent): Promise<PushDeliveryOutcome> {
  const outcome: PushDeliveryOutcome = {
    eligibleCount: 0,
    successfulCount: 0,
    retryableErrors: [],
    permanentErrors: [],
  };
  const subscriptions = await listActivePushSubscriptions();
  if (!subscriptions.length) return outcome;

  const scopes = await loadAdminScopes(subscriptions.map((s) => s.admin_id));
  const orphaned = subscriptions.filter((subscription) => !scopes.has(subscription.admin_id));
  await Promise.all(orphaned.map(async (subscription) => {
    const disabled = await disablePushSubscriptionById(subscription.id, subscription.admin_id);
    if (!disabled) outcome.retryableErrors.push(`Could not disable orphaned subscription ${subscription.id}`);
  }));
  const visibleSubscriptions = subscriptions.filter((subscription) => {
    const scope = scopes.get(subscription.admin_id);
    if (!scope) return false;
    return orderVisibleToScope(scope, {
      orderType: event.order_type,
      locationId: event.location_id,
    });
  });
  outcome.eligibleCount = visibleSubscriptions.length;
  if (!visibleSubscriptions.length) return outcome;

  if (!vapidConfigured) {
    console.error('[push] Order notification unavailable: VAPID keys missing', { orderId: event.order_id });
    await Promise.all(visibleSubscriptions.map(async subscription => {
      await markPushDeliveryFailure(subscription.id, 'Web Push is not configured');
      await createPushDeliveryLog({
        eventId: event.event_id,
        subscriptionId: subscription.id,
        status: 'failed',
        errorMessage: 'Web Push is not configured',
      });
    }));
    outcome.retryableErrors.push('Web Push is not configured');
    return outcome;
  }

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
    visibleSubscriptions.map(async (subscription) => {
      const alreadyLogged = await hasSuccessfulPushDeliveryLog(event.event_id, subscription.id);
      if (alreadyLogged) {
        outcome.successfulCount += 1;
        return;
      }

      const target = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      };

      let providerError: any = null;
      try {
        await webpush.sendNotification(target, payload, {
          TTL: 60,
          urgency: 'high',
          timeout: PUSH_SOCKET_TIMEOUT_MS,
        });
      } catch (error: any) {
        providerError = error;
      }

      if (!providerError) {
        await markPushDeliverySuccess(subscription.id);
        await createPushDeliveryLog({
          eventId: event.event_id,
          subscriptionId: subscription.id,
          status: 'success',
          statusCode: 201,
        });
        outcome.successfulCount += 1;
        return;
      }

      const statusCode = Number(providerError?.statusCode ?? 0) || undefined;
      const message = String(providerError?.body || providerError?.message || 'push failed');
      console.error('[push] order delivery failed', { orderId: event.order_id, subscriptionId: subscription.id, statusCode, message });
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
        return;
      }
      const errorLabel = `${subscription.id}: ${message}`;
      if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
        outcome.permanentErrors.push(errorLabel);
      } else {
        outcome.retryableErrors.push(errorLabel);
      }
    })
  );
  return outcome;
}
