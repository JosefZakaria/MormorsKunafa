import type Stripe from 'stripe';
import type { Row } from '../db/connection.js';
import {
  deleteReconciledCheckoutDraft,
  type InitiatedCheckoutDraft,
} from '../db/checkoutDraftRepository.js';
import { markOrderPaid } from './markOrderPaid.js';
import { getStripe } from './stripeClient.js';
import {
  getSwishPaymentRequest,
  verifySwishPaymentRequestIdentity,
  type SwishPaymentRequestResponse,
} from './swishClient.js';
import { validateStripeCheckoutSessionIdentity } from '../utils/confirmStripeCheckout.js';

export type CheckoutDraftReconciliationOutcome =
  | 'paid'
  | 'deleted'
  | 'pending'
  | 'rejected';

type ProviderState =
  | { state: 'paid'; paidAmountOre: number }
  | { state: 'terminal-unpaid' }
  | { state: 'pending' }
  | { state: 'rejected' };

export type CheckoutDraftReconciliationDependencies = {
  retrieveStripeSession: (sessionId: string) => Promise<Stripe.Checkout.Session>;
  retrieveSwishPayment: (instructionId: string) => Promise<SwishPaymentRequestResponse>;
  markPaid: (orderId: string, paidAmountOre: number) => Promise<boolean>;
  deleteDraft: (draft: InitiatedCheckoutDraft, before: string) => Promise<boolean>;
  swishPayeeAlias: string;
};

export function classifyStripeDraft(
  draft: InitiatedCheckoutDraft,
  session: Stripe.Checkout.Session
): ProviderState {
  if (!draft.stripeCheckoutSessionId) return { state: 'rejected' };
  const identity = validateStripeCheckoutSessionIdentity({
    id: draft.orderId,
    total_ore: draft.totalOre,
    stripe_checkout_session_id: draft.stripeCheckoutSessionId,
  } satisfies Row, session);
  if (!identity.ok) return { state: 'rejected' };

  if (session.status === 'complete' && session.payment_status === 'paid') {
    return { state: 'paid', paidAmountOre: identity.paidAmountOre };
  }
  if (session.status === 'expired' && session.payment_status === 'unpaid') {
    return { state: 'terminal-unpaid' };
  }
  if (
    (session.status === 'open' || session.status === 'complete') &&
    session.payment_status === 'unpaid'
  ) {
    return { state: 'pending' };
  }
  return { state: 'rejected' };
}

export function classifySwishDraft(
  draft: InitiatedCheckoutDraft,
  payment: SwishPaymentRequestResponse,
  payeeAlias: string
): ProviderState {
  if (!draft.swishInstructionId || !payeeAlias) return { state: 'rejected' };
  const identity = verifySwishPaymentRequestIdentity(payment, {
    instructionId: draft.swishInstructionId,
    amountOre: draft.totalOre,
    payeeAlias,
    payeePaymentReference: draft.orderId.slice(0, 35),
  });
  if (!identity.ok) return { state: 'rejected' };

  const status = String(payment.status ?? '').trim().toUpperCase();
  if (status === 'PAID') return { state: 'paid', paidAmountOre: identity.paidAmountOre };
  if (['DECLINED', 'ERROR', 'CANCELLED'].includes(status)) {
    return { state: 'terminal-unpaid' };
  }
  if (status === 'CREATED') return { state: 'pending' };
  return { state: 'rejected' };
}

const defaultDependencies: CheckoutDraftReconciliationDependencies = {
  retrieveStripeSession: (sessionId) => getStripe().checkout.sessions.retrieve(sessionId),
  retrieveSwishPayment: getSwishPaymentRequest,
  markPaid: async (orderId, paidAmountOre) => markOrderPaid(orderId, { paidAmountOre }),
  deleteDraft: deleteReconciledCheckoutDraft,
  swishPayeeAlias: process.env.SWISH_PAYEE_ALIAS?.trim() ?? '',
};

export async function reconcileInitiatedCheckoutDraft(
  draft: InitiatedCheckoutDraft,
  before: string,
  dependencies: CheckoutDraftReconciliationDependencies = defaultDependencies
): Promise<CheckoutDraftReconciliationOutcome> {
  const providerState = draft.paymentMethod === 'swish'
    ? classifySwishDraft(
        draft,
        await dependencies.retrieveSwishPayment(draft.swishInstructionId ?? ''),
        dependencies.swishPayeeAlias
      )
    : classifyStripeDraft(
        draft,
        await dependencies.retrieveStripeSession(draft.stripeCheckoutSessionId ?? '')
      );

  if (providerState.state === 'paid') {
    await dependencies.markPaid(draft.orderId, providerState.paidAmountOre);
    return 'paid';
  }
  if (providerState.state === 'terminal-unpaid') {
    return await dependencies.deleteDraft(draft, before) ? 'deleted' : 'pending';
  }
  return providerState.state;
}
