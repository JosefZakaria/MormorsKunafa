import type Stripe from 'stripe';
import { getStripe } from './stripeClient.js';
import { dbTimestampToIso } from '../utils/dbTimestamp.js';
import type { RetentionEvidence, RetentionOrder } from './orderRetention.js';

type Reader = Pick<Stripe, 'checkout'>;
export async function readRetentionCheckoutEvidence(orders: RetentionOrder[], now: Date, reader?: Reader): Promise<RetentionEvidence> {
  const pending = orders.filter(order => order.status === 'ny' && order.payment_status === 'pending'
    && ['card', 'app'].includes(String(order.payment_method)) && order.stripe_checkout_session_id);
  if (!pending.length) return {complete: true, sessions: []};
  const dates = pending.map(order => Date.parse(dbTimestampToIso(order.created_at) ?? ''));
  if (dates.some(date => !Number.isFinite(date) || date > now.getTime())) return {complete: false, sessions: []};
  const ids = new Set(pending.map(order => String(order.id)));
  const references = new Set(pending.map(order => String(order.stripe_checkout_session_id)));
  const evidence: RetentionEvidence = {complete: false, sessions: []};
  const deadline = Date.now() + 20000;
  let cursor: string | undefined;
  try {
    const stripe = reader ?? getStripe();
    // shortcut: scans above 2,000 sessions or 20 s require review; use a dedicated reconciliation job if this account outgrows the bound.
    for (let page = 0; page < 20 && Date.now() < deadline; page++) {
      const result = await stripe.checkout.sessions.list({limit: 100, starting_after: cursor,
        created: {gte: Math.floor(Math.min(...dates) / 1000) - 86400, lte: Math.floor(now.getTime() / 1000)}},
        {timeout: Math.max(1, Math.min(5000, deadline - Date.now())), maxNetworkRetries: 0});
      for (const session of result.data) {
        if (!ids.has(session.metadata?.orderId ?? '') && !references.has(session.id)) continue;
        evidence.sessions.push({id: session.id, orderId: session.metadata?.orderId ?? null, status: session.status,
          paymentStatus: session.payment_status, amount: session.amount_total, currency: session.currency,
          mode: session.mode, liveMode: session.livemode, created: session.created, expiresAt: session.expires_at});
      }
      if (!result.has_more) return {...evidence, complete: true};
      const next = result.data.at(-1)?.id;
      if (!next || next === cursor) return evidence;
      cursor = next;
    }
  } catch { /* Missing access or partial reads must never qualify an order for erasure. */ }
  return evidence;
}
