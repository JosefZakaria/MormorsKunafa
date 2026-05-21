import fs from 'node:fs';
import https from 'node:https';
import { randomUUID } from 'node:crypto';

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
  const env = (process.env.SWISH_ENV ?? 'test').trim().toLowerCase();
  if (env === 'prod' || env === 'production' || env === 'live') {
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
    const url = new URL(path, swishBaseUrl());

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
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
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
          reject(new Error(`Swish API ${res.statusCode}: ${text.slice(0, 500)}`));
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export function isSwishConfigured(): boolean {
  const payee = process.env.SWISH_PAYEE_ALIAS?.trim();
  const cert = process.env.SWISH_CERT_PATH?.trim();
  const key = process.env.SWISH_KEY_PATH?.trim();
  const callbackBase = process.env.SWISH_CALLBACK_BASE_URL?.trim();
  return !!(payee && cert && key && callbackBase);
}

export function swishCallbackUrl(): string {
  const base = process.env.SWISH_CALLBACK_BASE_URL?.trim().replace(/\/$/, '');
  if (!base) throw new Error('SWISH_CALLBACK_BASE_URL is not set');
  return `${base}/api/swish/callback`;
}

export function formatSwishAmount(totalOre: number): string {
  return (totalOre / 100).toFixed(2);
}

export function parseSwishAmountToOre(amount: number): number {
  return Math.round(amount * 100);
}

export async function createSwishPaymentRequest(params: {
  totalOre: number;
  orderNumber: string;
  payerAlias?: string;
  payeePaymentReference?: string;
}): Promise<{ instructionId: string; token?: string; status?: string }> {
  const payeeAlias = process.env.SWISH_PAYEE_ALIAS?.trim();
  if (!payeeAlias) throw new Error('SWISH_PAYEE_ALIAS is not set');

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
  return swishRequest<SwishPaymentRequestResponse>(
    'GET',
    `/swish-cpcapi/api/v1/paymentrequests/${instructionId}`
  );
}

/** Deep link / QR token URL for customer (test MSS uses simulator). */
export function swishPaymentPageUrl(token: string): string {
  const env = (process.env.SWISH_ENV ?? 'test').trim().toLowerCase();
  if (env === 'prod' || env === 'production' || env === 'live') {
    return `swish://paymentrequest?token=${encodeURIComponent(token)}`;
  }
  return `https://mss.cpc.getswish.net/paymentrequest/v1/${encodeURIComponent(token)}`;
}
