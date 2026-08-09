const STRIPE_SERVER_KEY_PATTERN = /^(?:sk|rk)_(?:test|live)_[^\s\u0000-\u001f\u007f]{8,240}$/;
const STRIPE_LIVE_KEY_PATTERN = /^(?:sk|rk)_live_/;
const STRIPE_WEBHOOK_SECRET_PATTERN = /^whsec_[^\s\u0000-\u001f\u007f]{16,240}$/;

export function requiresLiveStripeMode(
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV
): boolean {
  if (vercelEnv) return vercelEnv === 'production';
  return nodeEnv === 'production';
}

export function assertStripeServerKey(
  key: string,
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV
): void {
  if (!STRIPE_SERVER_KEY_PATTERN.test(key)) {
    throw new Error('STRIPE_SECRET_KEY must be a Stripe server-side secret or restricted key');
  }
  if (requiresLiveStripeMode(nodeEnv, vercelEnv) && !STRIPE_LIVE_KEY_PATTERN.test(key)) {
    throw new Error('A live Stripe server key is required in production');
  }
}

export function assertStripeWebhookSecret(secret: string): void {
  if (!STRIPE_WEBHOOK_SECRET_PATTERN.test(secret)) {
    throw new Error('STRIPE_WEBHOOK_SECRET has an invalid format');
  }
}

export function isExpectedStripeEventMode(
  livemode: boolean,
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV
): boolean {
  return !requiresLiveStripeMode(nodeEnv, vercelEnv) || livemode;
}

export function safeStripeVerificationError(error: unknown): string {
  if (error instanceof Error && /^[A-Za-z][A-Za-z0-9]*Error$/.test(error.name)) {
    return error.name.slice(0, 64);
  }
  return 'StripeVerificationError';
}
