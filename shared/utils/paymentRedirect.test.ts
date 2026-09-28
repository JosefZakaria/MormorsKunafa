import assert from 'node:assert/strict';
import test from 'node:test';
import { safePaymentRedirectUrl } from './paymentRedirect.js';

test('allows only hosted Stripe Checkout payment URLs', () => {
  const url = 'https://checkout.stripe.com/c/pay/cs_live_example?prefilled_email=a%40example.se';
  assert.equal(safePaymentRedirectUrl(url, 'stripe'), url);
  assert.equal(safePaymentRedirectUrl('https://attacker.example/c/pay/cs_live_example', 'stripe'), null);
  assert.equal(safePaymentRedirectUrl('https://checkout.stripe.com.evil.test/c/pay/x', 'stripe'), null);
  assert.equal(safePaymentRedirectUrl('javascript:alert(1)', 'stripe'), null);
});

test('allows only Swish app or simulator payment-request URLs', () => {
  assert.equal(
    safePaymentRedirectUrl('swish://paymentrequest?token=abcdefgh', 'swish'),
    'swish://paymentrequest?token=abcdefgh'
  );
  assert.equal(
    safePaymentRedirectUrl('https://mss.cpc.getswish.net/paymentrequest/v1/abcdefgh', 'swish'),
    'https://mss.cpc.getswish.net/paymentrequest/v1/abcdefgh'
  );
  assert.equal(safePaymentRedirectUrl('swish://other?token=abcdefgh', 'swish'), null);
  assert.equal(safePaymentRedirectUrl('https://attacker.example/paymentrequest/v1/x', 'swish'), null);
});
