import Stripe from 'stripe';
import { assertStripeServerKey } from '../utils/stripeSecurity.js';

let stripe: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
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
