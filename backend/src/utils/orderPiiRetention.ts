const DEFAULT_BATCH_SIZE = 100;
const MAXIMUM_BATCH_SIZE = 500;

export const OPERATIONAL_DETAILS_RETENTION_DAYS = 90;
export const CUSTOMER_CONTACT_RETENTION_DAYS = 1095;

export type OperationalPiiRetentionScope = 'operational_details' | 'customer_contact';

export type OperationalPiiRetentionRequest = {
  scope: OperationalPiiRetentionScope;
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
  if (Object.keys(record).some((key) => !['scope', 'limit', 'dryRun'].includes(key))) {
    return null;
  }
  const scope = record.scope;
  const limit = record.limit === undefined ? DEFAULT_BATCH_SIZE : integer(record.limit);
  const dryRun = record.dryRun === undefined ? true : record.dryRun;
  if (
    (scope !== 'operational_details' && scope !== 'customer_contact')
    || limit === undefined
    || limit < 1
    || limit > MAXIMUM_BATCH_SIZE
    || typeof dryRun !== 'boolean'
  ) {
    return null;
  }
  return { scope, limit, dryRun };
}

export function operationalPiiCutoff(
  scope: OperationalPiiRetentionScope,
  nowMs = Date.now()
): string {
  const retentionDays = retentionDaysForScope(scope);
  return new Date(nowMs - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

export function retentionDaysForScope(scope: OperationalPiiRetentionScope): number {
  return scope === 'operational_details'
    ? OPERATIONAL_DETAILS_RETENTION_DAYS
    : CUSTOMER_CONTACT_RETENTION_DAYS;
}
