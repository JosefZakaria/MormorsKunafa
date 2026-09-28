export type SafeErrorMetadata = {
  name?: string;
  code?: string;
  statusCode?: number;
};

const SAFE_IDENTIFIER = /^[A-Za-z0-9_.-]{1,64}$/u;

export function safeErrorMetadata(error: unknown): SafeErrorMetadata {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) return {};
  const candidate = error as { name?: unknown; code?: unknown; statusCode?: unknown; status?: unknown };
  const metadata: SafeErrorMetadata = {};

  const name = String(candidate.name ?? '');
  if (SAFE_IDENTIFIER.test(name)) metadata.name = name;

  const code = String(candidate.code ?? '');
  if (SAFE_IDENTIFIER.test(code)) metadata.code = code;

  const numericStatus = Number(candidate.statusCode ?? candidate.status);
  if (Number.isInteger(numericStatus) && numericStatus >= 100 && numericStatus <= 599) {
    metadata.statusCode = numericStatus;
  }

  return metadata;
}

export function logUnexpectedError(context: string, error: unknown): void {
  console.error(`[${context}]`, safeErrorMetadata(error));
}
