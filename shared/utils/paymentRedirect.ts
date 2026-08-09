export type PaymentRedirectKind = 'stripe' | 'swish';

export function safePaymentRedirectUrl(
  value: unknown,
  kind: PaymentRedirectKind
): string | null {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 4_096) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password || url.port || url.hash) return null;

  if (kind === 'stripe') {
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'checkout.stripe.com' ||
      (!url.pathname.startsWith('/c/pay/') && !url.pathname.startsWith('/pay/'))
    ) {
      return null;
    }
    return url.toString();
  }

  if (url.protocol === 'swish:') {
    const token = url.searchParams.get('token') ?? '';
    if (
      url.hostname !== 'paymentrequest' ||
      url.pathname !== '' ||
      url.searchParams.size !== 1 ||
      token.length < 8 ||
      token.length > 2_048
    ) {
      return null;
    }
    return url.toString();
  }

  if (
    url.protocol === 'https:' &&
    url.hostname.toLowerCase() === 'mss.cpc.getswish.net' &&
    url.pathname.startsWith('/paymentrequest/v1/') &&
    !url.search
  ) {
    return url.toString();
  }
  return null;
}
