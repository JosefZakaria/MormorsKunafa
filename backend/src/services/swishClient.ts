import fs from 'node:fs';
import https from 'node:https';
import { randomUUID } from 'node:crypto';

const SWISH_TIMEOUT_MS = 10_000;
const MAX_SWISH_RESPONSE_BYTES = 64 * 1024;
const MAX_SWISH_REQUEST_BYTES = 32 * 1024;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SWISH_PAYEE_PATTERN = /^\d{8,15}$/;

export type SwishEnvironment = 'test' | 'production';

export function parseSwishEnvironment(value?: string): SwishEnvironment {
  const environment = String(value ?? 'test').trim().toLowerCase();
  if (['prod', 'production', 'live'].includes(environment)) return 'production';
  if (['test', 'sandbox', 'mss'].includes(environment)) return 'test';
  throw new Error('SWISH_ENV must be test or production');
}

function requiresLiveSwishMode(): boolean {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === 'production';
  return process.env.NODE_ENV === 'production';
}

export function validateSwishCallbackBaseUrl(value?: string): string {
  const raw = String(value ?? '').trim().replace(/\/$/, '');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('SWISH_CALLBACK_BASE_URL must be a valid HTTPS URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    throw new Error('SWISH_CALLBACK_BASE_URL must be a clean HTTPS URL');
  }
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
}

export type SwishPaymentRequestBody = {
  payeeAlias: string;
  amount: string;
  currency: 'SEK';
  callbackUrl: string;
  payerAlias?: string;
  message?: string;
  payeePaymentReference?: string;
};

export type SwishPaymentRequestResponse = {
  id: string;
  status?: string;
  paymentRequestToken?: string;
  amount?: number;
  currency?: string;
  payeeAlias?: string;
  payeePaymentReference?: string;
  message?: string;
};

export type SwishCallbackPayload = {
  id: string;
  status: string;
  amount?: number;
  currency?: string;
  payeePaymentReference?: string;
  paymentReference?: string;
  message?: string;
};

function swishBaseUrl(): string {
  const environment = parseSwishEnvironment(process.env.SWISH_ENV);
  if (requiresLiveSwishMode() && environment !== 'production') {
    throw new Error('Production deployments require SWISH_ENV=production');
  }
  if (environment === 'production') {
    return 'https://cpc.getswish.net';
  }
  return 'https://mss.cpc.getswish.net';
}

function loadHttpsAgent(): https.Agent {
  const certPath = process.env.SWISH_CERT_PATH?.trim();
  const keyPath = process.env.SWISH_KEY_PATH?.trim();
  if (!certPath || !keyPath) {
    throw new Error('SWISH_CERT_PATH and SWISH_KEY_PATH must be set for Swish API');
  }
  const cert = fs.readFileSync(certPath);
  const key = fs.readFileSync(keyPath);
  const passphrase = process.env.SWISH_KEY_PASSPHRASE?.trim() || undefined;
  const caPath = process.env.SWISH_CA_PATH?.trim();
  const options: https.AgentOptions = {
    cert,
    key,
    passphrase,
    rejectUnauthorized: true,
  };
  if (caPath) {
    options.ca = fs.readFileSync(caPath);
  }
  return new https.Agent(options);
}

function swishRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const agent = loadHttpsAgent();
    const payload = body != null ? JSON.stringify(body) : undefined;
    if (payload && Buffer.byteLength(payload) > MAX_SWISH_REQUEST_BYTES) {
      reject(new Error('Swish API request body is too large'));
      return;
    }
    const url = new URL(path, swishBaseUrl());
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const req = https.request(
      url,
      {
        method,
        agent,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let responseBytes = 0;
        res.on('data', (chunk: Buffer | string) => {
          if (settled) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          responseBytes += buffer.length;
          if (responseBytes > MAX_SWISH_RESPONSE_BYTES) {
            res.destroy();
            fail(new Error('Swish API response is too large'));
            return;
          }
          chunks.push(buffer);
        });
        res.on('end', () => {
          if (settled) return;
          settled = true;
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            if (!text) {
              resolve({} as T);
              return;
            }
            try {
              resolve(JSON.parse(text) as T);
            } catch {
              resolve({} as T);
            }
            return;
          }
          reject(new Error(`Swish API request failed with status ${res.statusCode ?? 'unknown'}`));
        });
        res.on('aborted', () => fail(new Error('Swish API response was interrupted')));
      }
    );
    req.setTimeout(SWISH_TIMEOUT_MS, () => {
      req.destroy(new Error('Swish API request timed out'));
    });
    req.on('error', (error) => fail(error));
    if (payload) req.write(payload);
    req.end();
  });
}

export function parseSwishInstructionId(value: unknown): string | null {
  const instructionId = String(value ?? '').trim();
  return UUID_V4_PATTERN.test(instructionId) ? instructionId : null;
}

export function isSwishConfigured(): boolean {
  const payee = process.env.SWISH_PAYEE_ALIAS?.trim();
  const cert = process.env.SWISH_CERT_PATH?.trim();
  const key = process.env.SWISH_KEY_PATH?.trim();
  try {
    const environment = parseSwishEnvironment(process.env.SWISH_ENV);
    if (requiresLiveSwishMode() && environment !== 'production') return false;
    if (!payee || !SWISH_PAYEE_PATTERN.test(payee) || !cert || !key) return false;
    validateSwishCallbackBaseUrl(process.env.SWISH_CALLBACK_BASE_URL);
    return fs.existsSync(cert) && fs.existsSync(key);
  } catch {
    return false;
  }
}

export function swishCallbackUrl(): string {
  const base = validateSwishCallbackBaseUrl(process.env.SWISH_CALLBACK_BASE_URL);
  return `${base}/api/swish/callback`;
}

export function formatSwishAmount(totalOre: number): string {
  return (totalOre / 100).toFixed(2);
}

export function parseSwishAmountToOre(amount: number): number {
  return Math.round(amount * 100);
}

export type SwishPaymentVerification =
  | { ok: true; paidAmountOre: number }
  | { ok: false; reason: string };

/** Validate a payment fetched directly from Swish over the configured mTLS connection. */
export function verifySwishPaymentRequest(
  payment: SwishPaymentRequestResponse,
  expected: {
    instructionId: string;
    amountOre: number;
    payeeAlias: string;
    payeePaymentReference: string;
  }
): SwishPaymentVerification {
  if (payment.id !== expected.instructionId) {
    return { ok: false, reason: 'Swish instruction ID mismatch' };
  }
  if (String(payment.status ?? '').toUpperCase() !== 'PAID') {
    return { ok: false, reason: 'Swish payment is not paid' };
  }
  if (typeof payment.amount !== 'number' || !Number.isFinite(payment.amount)) {
    return { ok: false, reason: 'Swish payment amount missing' };
  }
  const paidAmountOre = parseSwishAmountToOre(payment.amount);
  if (paidAmountOre !== expected.amountOre) {
    return { ok: false, reason: 'Swish payment amount mismatch' };
  }
  if (String(payment.currency ?? '').toUpperCase() !== 'SEK') {
    return { ok: false, reason: 'Swish payment currency mismatch' };
  }
  if (String(payment.payeeAlias ?? '').trim() !== expected.payeeAlias) {
    return { ok: false, reason: 'Swish payee mismatch' };
  }
  if (String(payment.payeePaymentReference ?? '').trim() !== expected.payeePaymentReference) {
    return { ok: false, reason: 'Swish order reference mismatch' };
  }
  return { ok: true, paidAmountOre };
}

export async function createSwishPaymentRequest(params: {
  totalOre: number;
  orderNumber: string;
  payerAlias?: string;
  payeePaymentReference?: string;
}): Promise<{ instructionId: string; token?: string; status?: string }> {
  const payeeAlias = process.env.SWISH_PAYEE_ALIAS?.trim();
  if (!payeeAlias || !SWISH_PAYEE_PATTERN.test(payeeAlias)) {
    throw new Error('SWISH_PAYEE_ALIAS must contain 8 to 15 digits');
  }

  const instructionId = randomUUID();
  const body: SwishPaymentRequestBody = {
    payeeAlias,
    amount: formatSwishAmount(params.totalOre),
    currency: 'SEK',
    callbackUrl: swishCallbackUrl(),
    message: `Mormors Kunafa ${params.orderNumber}`.slice(0, 50),
    ...(params.payeePaymentReference
      ? { payeePaymentReference: params.payeePaymentReference.slice(0, 35) }
      : {}),
    ...(params.payerAlias ? { payerAlias: params.payerAlias } : {}),
  };

  await swishRequest<unknown>(
    'PUT',
    `/swish-cpcapi/api/v2/paymentrequests/${instructionId}`,
    body
  );

  let token: string | undefined;
  let status: string | undefined;
  try {
    const fetched = await getSwishPaymentRequest(instructionId);
    token = fetched.paymentRequestToken;
    status = fetched.status;
  } catch (e) {
    console.warn('[swish] could not fetch payment request after create', e);
  }

  return { instructionId, token, status };
}

export async function getSwishPaymentRequest(instructionId: string): Promise<SwishPaymentRequestResponse> {
  const validatedId = parseSwishInstructionId(instructionId);
  if (!validatedId) throw new Error('Invalid Swish instruction ID');
  return swishRequest<SwishPaymentRequestResponse>(
    'GET',
    `/swish-cpcapi/api/v1/paymentrequests/${validatedId}`
  );
}

/** Deep link / QR token URL for customer (test MSS uses simulator). */
export function swishPaymentPageUrl(token: string): string {
  const environment = parseSwishEnvironment(process.env.SWISH_ENV);
  if (requiresLiveSwishMode() && environment !== 'production') {
    throw new Error('Production deployments require SWISH_ENV=production');
  }
  if (environment === 'production') {
    return `swish://paymentrequest?token=${encodeURIComponent(token)}`;
  }
  return `https://mss.cpc.getswish.net/paymentrequest/v1/${encodeURIComponent(token)}`;
}
