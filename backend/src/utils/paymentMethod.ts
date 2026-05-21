/** Online payments that stay pending until confirmed (Stripe or Swish). */
export function isOnlinePayment(method: string): boolean {
  const m = method.trim().toLowerCase();
  return m === 'card' || m === 'swish' || m === 'app';
}

export function isCardPayment(method: string): boolean {
  const m = method.trim().toLowerCase();
  return m === 'card' || m === 'app';
}

export function isSwishPayment(method: string): boolean {
  return method.trim().toLowerCase() === 'swish';
}

export const ALLOWED_PAYMENT_METHODS = ['card', 'swish', 'cash', 'app'] as const;

export function isAllowedPaymentMethod(method: string): boolean {
  return (ALLOWED_PAYMENT_METHODS as readonly string[]).includes(method.trim().toLowerCase());
}

/** Swish payerAlias: digits only, Swedish 07… → 467… */
export function normalizeSwishPayerAlias(phone: string): string | undefined {
  let digits = phone.replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.startsWith('46')) {
    return digits.length >= 11 ? digits : undefined;
  }
  if (digits.startsWith('0') && digits.length >= 9) {
    digits = `46${digits.slice(1)}`;
    return digits.length >= 11 ? digits : undefined;
  }
  return undefined;
}
