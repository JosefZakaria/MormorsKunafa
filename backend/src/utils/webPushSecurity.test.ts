import assert from 'node:assert/strict';
import test from 'node:test';
import type { LookupAddress, LookupOptions } from 'node:dns';
import {
  createSafePushLookup,
  parsePushEndpointForRevocation,
  parseSafePushEndpoint,
  safePushFailureReason,
  validatePushSubscription,
} from './webPushSecurity.js';

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

test('logout endpoint parsing is bounded but independent of the send allowlist', () => {
  assert.equal(
    parsePushEndpointForRevocation('https://unsupported-provider.example.test/push')?.toString(),
    'https://unsupported-provider.example.test/push'
  );
  assert.equal(
    parsePushEndpointForRevocation('https://127.0.0.1/push')?.toString(),
    'https://127.0.0.1/push'
  );
  for (const endpoint of [
    'http://fcm.googleapis.com/a',
    'https://user:password@fcm.googleapis.com/a',
    'https://fcm.googleapis.com:8443/a',
    'https://fcm.googleapis.com/a#fragment',
    'not-a-url',
    `https://example.test/${'x'.repeat(2048)}`,
  ]) {
    assert.equal(parsePushEndpointForRevocation(endpoint), null, endpoint);
  }
});

function resolveFixture(addresses: LookupAddress[], options: LookupOptions = {}) {
  return new Promise<{ address: string | LookupAddress[]; family?: number }>((resolve, reject) => {
    createSafePushLookup(async (hostname, requested) => {
      assert.equal(hostname, 'fcm.googleapis.com');
      assert.equal(requested.all, true);
      return addresses;
    })('fcm.googleapis.com', options, (error, address, family) => {
      if (error) reject(error);
      else resolve({ address, family });
    });
  });
}

test('push DNS preserves public IPv4 and IPv6 with both Node callback contracts', async () => {
  const addresses = [{ address: '8.8.8.8', family: 4 }, { address: '2001:4860:4860::8888', family: 6 }];
  assert.deepEqual(await resolveFixture(addresses, { all: true }), { address: addresses, family: undefined });
  for (const entry of addresses) {
    assert.deepEqual(await resolveFixture([entry], { all: false }), entry);
  }
});

test('push DNS refuses empty, malformed, private and mixed public/private answers', async () => {
  const denied = [
    { address: '127.0.0.1', family: 4 }, { address: '10.0.0.1', family: 4 },
    { address: '169.254.169.254', family: 4 }, { address: '192.168.1.1', family: 4 },
    { address: '100.64.0.1', family: 4 }, { address: '::1', family: 6 },
    { address: 'fc00::1', family: 6 }, { address: 'fe80::1', family: 6 },
    { address: '::ffff:8.8.8.8', family: 6 }, { address: '::ffff:127.0.0.1', family: 6 },
    { address: '::ffff:808:808', family: 6 },
    { address: '8.8.8.8', family: 6 }, { address: '::1', family: 4 },
    { address: 'not-an-ip', family: 4 },
  ];
  for (const all of [false, true]) {
    await assert.rejects(resolveFixture([], { all }), { code: 'EPUSHPRIVATE' });
    for (const entry of denied) {
      await assert.rejects(resolveFixture([entry], { all }), { code: 'EPUSHPRIVATE' });
      await assert.rejects(resolveFixture([{ address: '8.8.8.8', family: 4 }, entry], { all }), { code: 'EPUSHPRIVATE' });
      await assert.rejects(resolveFixture([entry, { address: '8.8.8.8', family: 4 }], { all }), { code: 'EPUSHPRIVATE' });
    }
  }
});

test('explicit endpoint host configuration cannot admit private IP literals', () => {
  const previous = process.env.WEB_PUSH_ALLOWED_HOSTS;
  process.env.WEB_PUSH_ALLOWED_HOSTS = '127.0.0.1,[::1],[::ffff:808:808],8.8.8.8';
  try {
    for (const host of ['127.0.0.1', '[::1]', '[::ffff:808:808]']) {
      assert.equal(parseSafePushEndpoint(`https://${host}/push`), null);
    }
    assert.equal(parseSafePushEndpoint('https://8.8.8.8/push')?.hostname, '8.8.8.8');
  } finally {
    if (previous === undefined) delete process.env.WEB_PUSH_ALLOWED_HOSTS;
    else process.env.WEB_PUSH_ALLOWED_HOSTS = previous;
  }
});

test('push DNS propagates lookup failure without an address fallback', async () => {
  const failure = Object.assign(new Error('synthetic failure'), { code: 'ENOTFOUND' });
  await assert.rejects(new Promise((resolve, reject) => {
    createSafePushLookup(async () => { throw failure; })('fcm.googleapis.com', { all: true }, (error, address) => {
      assert.equal(address, '');
      if (error) reject(error);
      else resolve(address);
    });
  }), failure);
});
