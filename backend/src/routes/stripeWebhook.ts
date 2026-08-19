import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { getStripe } from '../services/stripeClient.js';
import { markOrderPaid } from '../services/markOrderPaid.js';
import { getOrderById } from '../db/orderRepository.js';
import { validateStripeCheckoutSession } from '../utils/confirmStripeCheckout.js';
import {
  assertStripeWebhookSecret,
  isExpectedStripeEventMode,
  safeStripeVerificationError,
} from '../utils/stripeSecurity.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';
import {
  claimStripeEvent,
  completeStripeEvent,
  failStripeEvent,
} from '../db/paymentEventRepository.js';
import {
  finalizeOrderRefund,
  getRefundRecord,
  setRefundProviderReference,
} from '../db/refundRepository.js';
import {
  validateStripeRefundEvent,
  validateStripeRefundSession,
} from '../services/refundProviders.js';
import { isCanonicalUuidV4 } from '../utils/resourceId.js';
import {
  finalizeDuplicateStripeRefund,
  getDuplicateStripeRefundByEvent,
  setDuplicateStripeRefundProviderReference,
} from '../db/duplicateStripeRefundRepository.js';
import { validateDuplicateStripeRefundEvent } from '../services/duplicatePaymentRefunds.js';

async function markOrderPaidFromSession(
  session: Stripe.Checkout.Session
): Promise<{ orderId: string | null; outcome: string }> {
  const orderId = session.metadata?.orderId?.trim();
  if (!orderId) {
    console.warn('[stripe webhook] checkout.session.completed missing metadata.orderId');
    return { orderId: null, outcome: 'alert_missing_order_id' };
  }

  const result = await getOrderById(orderId);
  if (!result) {
    console.warn('[stripe webhook] order not found', orderId);
    return { orderId, outcome: 'alert_order_not_found' };
  }

  const validation = validateStripeCheckoutSession(result.order, session);
  if (!validation.ok) {
    console.error('[stripe webhook] checkout validation failed', {
      sessionId: session.id,
      orderId,
      error: validation.error,
    });
    return { orderId, outcome: 'alert_paid_session_validation_failed' };
  }

  const newlyPaid = await markOrderPaid(orderId, { paidAmountOre: validation.paidAmountOre });
  return { orderId, outcome: newlyPaid ? 'order_marked_paid' : 'order_already_paid' };
}

async function reconcileStripeRefundEvent(
  refund: Stripe.Refund
): Promise<{ orderId: string | null; outcome: string }> {
  const duplicateEventId = refund.metadata?.duplicatePaymentEventId?.trim();
  const duplicateRefundId = refund.metadata?.duplicateRefundId?.trim();
  if (duplicateEventId || duplicateRefundId) {
    if (
      !duplicateEventId
      || !/^evt_[A-Za-z0-9_]{8,255}$/.test(duplicateEventId)
      || !isCanonicalUuidV4(duplicateRefundId)
    ) {
      return { orderId: null, outcome: 'ignored_invalid_duplicate_refund_metadata' };
    }
    const duplicate = await getDuplicateStripeRefundByEvent(duplicateEventId);
    if (!duplicate || duplicate.id !== duplicateRefundId) {
      return { orderId: null, outcome: 'ignored_unknown_duplicate_refund' };
    }
    const validation = validateDuplicateStripeRefundEvent(refund, {
      refundId: duplicate.id,
      eventId: duplicate.eventId,
      orderId: duplicate.orderId,
      amountOre: duplicate.amountOre,
      paymentIntentId: duplicate.paymentIntentId,
      providerRefundId: duplicate.providerRefundId,
    });
    if (!validation.ok) throw new Error(validation.reason);
    if (!duplicate.providerRefundId) {
      await setDuplicateStripeRefundProviderReference(duplicate.id, refund.id);
    }
    if (validation.outcome.status !== 'pending') {
      await finalizeDuplicateStripeRefund({
        refundId: duplicate.id,
        succeeded: validation.outcome.status === 'succeeded',
        failureCode: validation.outcome.failureCode,
      });
    }
    return {
      orderId: duplicate.orderId,
      outcome: `duplicate_refund_${validation.outcome.status}`,
    };
  }

  const refundId = refund.metadata?.refundId?.trim();
  const orderId = refund.metadata?.orderId?.trim();
  if (!isCanonicalUuidV4(refundId) || !isCanonicalUuidV4(orderId)) {
    return { orderId: null, outcome: 'ignored_invalid_refund_metadata' };
  }
  const record = await getRefundRecord(refundId);
  if (!record || record.provider !== 'stripe' || record.orderId !== orderId) {
    return { orderId, outcome: 'ignored_unknown_refund' };
  }
  const order = await getOrderById(orderId);
  const sessionId = String(order?.order.stripe_checkout_session_id ?? '').trim();
  const totalPaidOre = Number(order?.order.total_ore);
  if (!order || !sessionId || !Number.isSafeInteger(totalPaidOre) || totalPaidOre <= 0) {
    throw new Error('Stripe refund order is inconsistent');
  }
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const original = validateStripeRefundSession(session, { orderId, sessionId, totalPaidOre });
  if (!original.ok) throw new Error(original.reason);
  const validation = validateStripeRefundEvent(refund, {
    refundId,
    orderId,
    amountOre: record.amountOre,
    paymentIntentId: original.paymentIntentId,
    providerRefundId: record.providerRefundId,
  });
  if (!validation.ok) throw new Error(validation.reason);
  if (!record.providerRefundId) {
    await setRefundProviderReference(refundId, refund.id);
  }
  if (validation.outcome.status !== 'pending') {
    await finalizeOrderRefund({
      refundId,
      succeeded: validation.outcome.status === 'succeeded',
      failureCode: validation.outcome.failureCode,
    });
  }
  return { orderId, outcome: `refund_${validation.outcome.status}` };
}

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    res.status(503).send('Webhook not configured');
    return;
  }
  try {
    assertStripeWebhookSecret(secret);
  } catch {
    console.error('[stripe webhook] signing secret configuration is invalid');
    res.status(503).send('Webhook not configured');
    return;
  }

  const sig = req.headers['stripe-signature'];
  if (!sig || typeof sig !== 'string') {
    res.status(400).send('Missing stripe-signature');
    return;
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error('[stripe webhook] signature verification failed:', safeStripeVerificationError(err));
    res.status(400).send('Invalid webhook signature');
    return;
  }

  if (!isExpectedStripeEventMode(event.livemode)) {
    console.error('[stripe webhook] rejected non-live event in production', {
      eventId: event.id,
      eventType: event.type,
    });
    res.status(400).send('Webhook mode mismatch');
    return;
  }

  let claimed = false;
  try {
    claimed = await claimStripeEvent(event.id, event.type, event.livemode);
    if (!claimed) {
      res.json({ received: true, duplicate: true });
      return;
    }

    let orderId: string | null = null;
    let outcome = 'ignored_event_type';
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === 'paid') {
        const result = await markOrderPaidFromSession(session);
        orderId = result.orderId;
        outcome = result.outcome;
      } else {
        orderId = session.metadata?.orderId?.trim() || null;
        outcome = 'ignored_unpaid_session';
      }
    } else if (
      event.type === 'refund.created' ||
      event.type === 'refund.updated' ||
      event.type === 'refund.failed'
    ) {
      const result = await reconcileStripeRefundEvent(event.data.object as Stripe.Refund);
      orderId = result.orderId;
      outcome = result.outcome;
    }
    await completeStripeEvent(event.id, orderId, outcome);
    res.json({ received: true });
  } catch (e) {
    if (claimed) {
      try {
        await failStripeEvent(event.id);
      } catch (markFailedError) {
        logUnexpectedError('stripe webhook could not release event lease', markFailedError);
      }
    }
    logUnexpectedError('stripe webhook handler error', e);
    res.status(500).send('Webhook handler failed');
  }
}
