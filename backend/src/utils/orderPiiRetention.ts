const MINIMUM_RETENTION_DAYS = 30;
const MAXIMUM_RETENTION_DAYS = 3650;
const DEFAULT_BATCH_SIZE = 100;
const MAXIMUM_BATCH_SIZE = 500;

export type OperationalPiiRetentionRequest = {
  retentionDays: number;
  limit: number;
  dryRun: boolean;
};

function integer(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return undefined;
  return value;
}

export function parseOperationalPiiRetentionRequest(
  value: unknown
): OperationalPiiRetentionRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !['retentionDays', 'limit', 'dryRun'].includes(key))) {
    return null;
  }
  const retentionDays = integer(record.retentionDays);
  const limit = record.limit === undefined ? DEFAULT_BATCH_SIZE : integer(record.limit);
  const dryRun = record.dryRun === undefined ? true : record.dryRun;
  if (
    retentionDays === undefined
    || retentionDays < MINIMUM_RETENTION_DAYS
    || retentionDays > MAXIMUM_RETENTION_DAYS
    || limit === undefined
    || limit < 1
    || limit > MAXIMUM_BATCH_SIZE
    || typeof dryRun !== 'boolean'
  ) {
    return null;
  }
  return { retentionDays, limit, dryRun };
}

export function operationalPiiCutoff(retentionDays: number, nowMs = Date.now()): string {
  if (!Number.isSafeInteger(retentionDays) || retentionDays < MINIMUM_RETENTION_DAYS) {
    throw new Error('Operational PII retention must be at least 30 days');
  }
  return new Date(nowMs - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}
