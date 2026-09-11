export const CHECKOUT_CONTRACT_HEADER = 'X-Checkout-Contract';
export const CHECKOUT_CONTRACT_VERSION = 'order-v2';
export const CLIENT_UPGRADE_REQUIRED_CODE = 'CLIENT_UPGRADE_REQUIRED';
export const CLIENT_UPGRADE_REQUIRED_MESSAGE =
  'Den här sidan är inaktuell. Ladda om sidan innan du försöker igen. Begäran stoppades innan någon ny order- eller betalningsåtgärd utfördes. Om en beställning redan kan ha skapats, kontakta butiken innan du betalar eller beställer igen.';

export type CheckoutBackendContract = 'current' | 'legacy' | 'unknown';

const ORDER_STATUS_TOKEN_PATTERN =
  /^v[12]\.\d{10}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/;

export function isOrderStatusCapability(value: unknown): value is string {
  return typeof value === 'string' && ORDER_STATUS_TOKEN_PATTERN.test(value);
}

/**
 * The create response is the only rollout signal. A response with neither
 * field came from locked main. Legacy, partial and unfamiliar signals are kept
 * for staffed reconciliation and must never start a payment.
 */
export function classifyCheckoutCreateResponse(value: {
  checkoutContract?: unknown;
  statusToken?: unknown;
}): CheckoutBackendContract {
  if (
    value.checkoutContract === CHECKOUT_CONTRACT_VERSION
    && isOrderStatusCapability(value.statusToken)
  ) {
    return 'current';
  }
  if (value.checkoutContract == null && value.statusToken == null) return 'legacy';
  return 'unknown';
}
