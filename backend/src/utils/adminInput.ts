import { CustomerInputError, sanitizeOperationalText } from './customerInput.js';

export class AdminInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminInputError';
  }
}

export function parsePreparationMinutes(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 240) {
    throw new AdminInputError('Tillagningstid måste vara ett heltal mellan 1 och 240 minuter.');
  }
  return Number(value);
}

export function parseEstimatedReadyTime(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 40) {
    throw new AdminInputError('Färdigtiden är ogiltig.');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new AdminInputError('Färdigtiden är ogiltig.');
  return parsed.toISOString();
}

export function parseDateOnly(value: unknown, field: string): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new AdminInputError(`${field} måste anges som ÅÅÅÅ-MM-DD.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new AdminInputError(`${field} är inte ett giltigt datum.`);
  }
  return value;
}

export function parseHistoryLimit(value: unknown): number {
  if (value == null || value === '') return 50;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new AdminInputError('limit måste vara ett heltal mellan 1 och 500.');
  }
  return parsed;
}

export function parseInternalNotes(value: unknown): string | null {
  try {
    const text = sanitizeOperationalText(value, 'Intern notis', 2_000);
    return text || null;
  } catch (error) {
    if (error instanceof CustomerInputError) throw new AdminInputError(error.message);
    throw error;
  }
}

export function parseAdminLoginInput(emailValue: unknown, passwordValue: unknown): {
  email: string;
  password: string;
} {
  const email = typeof emailValue === 'string' ? emailValue.trim().toLowerCase() : '';
  const password = typeof passwordValue === 'string' ? passwordValue : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new AdminInputError('Giltig e-postadress och lösenord krävs.');
  }
  if (!password || Buffer.byteLength(password, 'utf8') > 72) {
    throw new AdminInputError('Giltig e-postadress och lösenord krävs.');
  }
  return { email, password };
}

export function parseOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'boolean') throw new AdminInputError(`${field} måste vara true eller false.`);
  return value;
}

export function parseStatisticsRange(startValue: unknown, endValue: unknown): {
  startDate?: string;
  endDate?: string;
} {
  const startDate = parseDateOnly(startValue, 'Från-datum');
  const endDate = parseDateOnly(endValue, 'Till-datum');
  if (Boolean(startDate) !== Boolean(endDate)) {
    throw new AdminInputError('Både från- och till-datum måste anges.');
  }
  if (startDate && endDate && startDate > endDate) {
    throw new AdminInputError('Från-datum får inte vara efter till-datum.');
  }
  return { startDate, endDate };
}
