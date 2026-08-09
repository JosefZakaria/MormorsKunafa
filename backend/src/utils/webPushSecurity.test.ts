import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSafePushEndpoint, safePushFailureReason, validatePushSubscription } from './webPushSecurity.js';

const p256dh = Buffer.alloc(65, 1).toString('base64url');
const auth = Buffer.alloc(16, 2).toString('base64url');

test('accepts a structurally valid public HTTPS push subscription', () => {
  const result = validatePushSubscription({
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    p256dh,
    auth,
    deviceLabel: 'Kassa',
    userAgent: 'Browser',
  });

  assert.equal(result?.endpoint, 'https://fcm.googleapis.com/fcm/send/abc');
});

test('rejects unsafe endpoint schemes, credentials, ports and literal private addresses', () => {
  for (const endpoint of [
    'http://fcm.googleapis.com/a',
    'https://user:password@fcm.googleapis.com/a',
    'https://fcm.googleapis.com:8443/a',
    'https://example.com/a',
    'https://127.0.0.1/a',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/a',
  ]) {
    assert.equal(parseSafePushEndpoint(endpoint), null, endpoint);
  }
});

test('rejects malformed encryption keys and oversized metadata', () => {
  assert.equal(validatePushSubscription({ endpoint: 'https://fcm.googleapis.com/a', p256dh: 'bad', auth }), null);
  assert.equal(
    validatePushSubscription({
      endpoint: 'https://fcm.googleapis.com/a',
      p256dh,
      auth,
      deviceLabel: 'x'.repeat(101),
    }),
    null
  );
});

test('does not persist attacker-controlled upstream response bodies', () => {
  assert.equal(safePushFailureReason({ statusCode: 500, body: 'secret response body' }), 'Push service returned HTTP 500');
  assert.equal(safePushFailureReason({ code: 'ETIMEDOUT', message: 'sensitive URL' }), 'ETIMEDOUT');
});
