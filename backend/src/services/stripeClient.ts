import Stripe from 'stripe';
import { assertStripeServerKey } from '../utils/stripeSecurity.js';

let stripe: Stripe | null = null;

export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return false;
  try {
    assertStripeServerKey(key);
    return true;
  } catch {
    return false;
  }
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  assertStripeServerKey(key);
  if (!stripe) {
    stripe = new Stripe(key);
  }
  return stripe;
}
