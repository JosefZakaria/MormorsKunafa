import jwt from 'jsonwebtoken';

function secret(): string | null {
  const value = process.env.JWT_SECRET?.trim();
  return value && value.length >= 32 && value !== 'dev-secret-change-in-production' ? value : null;
}

export function createOrderStatusToken(orderId: string, readyAt: Date): string | undefined {
  const key = secret();
  if (!key) return undefined;
  // Preorders must retain access until seven days after their planned pickup.
  const expiresIn = Math.max(0, Math.ceil((readyAt.getTime() - Date.now()) / 1000)) + 7 * 86400;
  return jwt.sign({}, key, { algorithm: 'HS256', audience: 'order-status', subject: orderId, expiresIn });
}

export function canReadOrderContact(orderId: string, token: string | undefined): boolean {
  const key = secret();
  if (!key || !token) return false;
  try {
    const payload = jwt.verify(token, key, { algorithms: ['HS256'], audience: 'order-status', subject: orderId });
    return typeof payload !== 'string' && typeof payload.exp === 'number';
  } catch {
    return false;
  }
}
