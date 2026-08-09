import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import webpush from 'web-push';

const MAX_ENDPOINT_LENGTH = 2_048;
const MAX_DEVICE_LABEL_LENGTH = 100;
const MAX_USER_AGENT_LENGTH = 512;
const MAX_PUSH_RESPONSE_BYTES = 16 * 1024;
const PUSH_TIMEOUT_MS = 5_000;

const defaultAllowedPushHosts = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
]);

const blockedAddresses = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6');
}

function isPublicAddress(address: string, family?: number): boolean {
  const resolvedFamily = family ?? isIP(address);
  if (resolvedFamily === 4) return !blockedAddresses.check(address, 'ipv4');
  if (resolvedFamily === 6) return !blockedAddresses.check(address, 'ipv6');
  return false;
}

function isAllowedPushHost(hostname: string): boolean {
  const configuredHosts = String(process.env.WEB_PUSH_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set([...defaultAllowedPushHosts, ...configuredHosts]);
  return allowed.has(hostname) || hostname.endsWith('.notify.windows.com');
}

export function parseSafePushEndpoint(value: unknown): URL | null {
  const endpoint = String(value ?? '').trim();
  if (!endpoint || endpoint.length > MAX_ENDPOINT_LENGTH) return null;

  try {
    const url = new URL(endpoint);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hash ||
      (url.port && url.port !== '443') ||
      !isAllowedPushHost(url.hostname.toLowerCase())
    ) {
      return null;
    }

    const hostname = url.hostname.startsWith('[') && url.hostname.endsWith(']')
      ? url.hostname.slice(1, -1)
      : url.hostname;
    const literalFamily = isIP(hostname);
    if (literalFamily && !isPublicAddress(hostname, literalFamily)) return null;
    return url;
  } catch {
    return null;
  }
}

function isBase64UrlWithDecodedLength(value: string, expectedBytes: number): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    return Buffer.from(value, 'base64url').length === expectedBytes;
  } catch {
    return false;
  }
}

export function validatePushSubscription(input: {
  endpoint: unknown;
  p256dh: unknown;
  auth: unknown;
  deviceLabel?: unknown;
  userAgent?: unknown;
}): {
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceLabel?: string;
  userAgent?: string;
} | null {
  const endpoint = parseSafePushEndpoint(input.endpoint)?.toString();
  const p256dh = String(input.p256dh ?? '').trim();
  const auth = String(input.auth ?? '').trim();
  const deviceLabel = String(input.deviceLabel ?? '').trim();
  const userAgent = String(input.userAgent ?? '').trim();

  if (
    !endpoint ||
    !isBase64UrlWithDecodedLength(p256dh, 65) ||
    !isBase64UrlWithDecodedLength(auth, 16) ||
    deviceLabel.length > MAX_DEVICE_LABEL_LENGTH ||
    userAgent.length > MAX_USER_AGENT_LENGTH
  ) {
    return null;
  }

  return {
    endpoint,
    p256dh,
    auth,
    deviceLabel: deviceLabel || undefined,
    userAgent: userAgent || undefined,
  };
}

const safeLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, {
    all: true,
    family: options.family,
    hints: options.hints,
    verbatim: true,
  })
    .then((addresses) => {
      if (!addresses.length || addresses.some(({ address, family }) => !isPublicAddress(address, family))) {
        const error = new Error('Push endpoint resolved to a non-public address') as NodeJS.ErrnoException;
        error.code = 'EPUSHPRIVATE';
        callback(error, '', 0);
        return;
      }

      const selected = addresses[0];
      callback(null, selected.address, selected.family);
    })
    .catch((error: NodeJS.ErrnoException) => callback(error, '', 0));
};

export function createSafePushAgent(): https.Agent {
  return new https.Agent({
    keepAlive: false,
    maxSockets: 10,
    lookup: safeLookup,
  });
}

export async function sendWebPushSafely(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string
): Promise<{ statusCode: number }> {
  if (!parseSafePushEndpoint(subscription.endpoint)) {
    throw Object.assign(new Error('Push endpoint is not allowed'), { code: 'EPUSHENDPOINT' });
  }

  const details = webpush.generateRequestDetails(subscription, payload, {
    TTL: 60,
    urgency: 'high',
  });
  const agent = createSafePushAgent();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error & { statusCode?: number }, statusCode?: number) => {
      if (settled) return;
      settled = true;
      agent.destroy();
      if (error) reject(error);
      else resolve({ statusCode: statusCode ?? 0 });
    };

    const request = https.request(details.endpoint, {
      method: details.method,
      headers: details.headers,
      agent,
      timeout: PUSH_TIMEOUT_MS,
      maxHeaderSize: MAX_PUSH_RESPONSE_BYTES,
    }, (response) => {
      let responseBytes = 0;
      response.on('data', (chunk: Buffer) => {
        responseBytes += chunk.length;
        if (responseBytes > MAX_PUSH_RESPONSE_BYTES) {
          request.destroy(Object.assign(new Error('Push response exceeded size limit'), {
            code: 'EPUSHRESPONSE',
          }));
        }
      });
      response.on('end', () => {
        const statusCode = response.statusCode ?? 0;
        if (statusCode < 200 || statusCode > 299) {
          finish(Object.assign(new Error('Push service returned an error'), { statusCode }));
          return;
        }
        finish(undefined, statusCode);
      });
    });

    request.on('timeout', () => {
      request.destroy(Object.assign(new Error('Push request timed out'), { code: 'ETIMEDOUT' }));
    });
    request.on('error', (error) => finish(error));
    if (details.body) request.write(details.body);
    request.end();
  });
}

export function safePushFailureReason(error: unknown): string {
  const candidate = error as { statusCode?: unknown; code?: unknown } | null;
  const statusCode = Number(candidate?.statusCode ?? 0);
  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599) {
    return `Push service returned HTTP ${statusCode}`;
  }

  const code = String(candidate?.code ?? 'PUSH_REQUEST_FAILED');
  return /^[A-Z0-9_]{1,40}$/.test(code) ? code : 'PUSH_REQUEST_FAILED';
}
