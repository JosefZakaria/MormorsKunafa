import type { PhoneOrderRequest } from '@mormors-kunafa/shared/types';

export class PhoneOrderError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new PhoneOrderError(400, `Ange ${label}.`);
  }
  return value.trim();
}

export function parsePhoneOrder(body: unknown): PhoneOrderRequest {
  if (!body || typeof body !== 'object') throw new PhoneOrderError(400, 'Ogiltig beställning.');
  const input = body as Record<string, unknown>;
  const requestId = text(input.requestId, 'beställnings-id', 36);
  const locationId = text(input.locationId, 'lokal', 36);
  if (!UUID.test(requestId) || !UUID.test(locationId)) throw new PhoneOrderError(400, 'Ogiltig lokal eller beställnings-id.');
  const customer = input.customer as Record<string, unknown> | undefined;
  const firstName = text(customer?.firstName, 'kundens förnamn', 80);
  const lastName = text(customer?.lastName, 'kundens efternamn', 80);
  const phone = text(customer?.phone, 'telefonnummer', 25);
  const email = text(customer?.email, 'e-postadress', 254);
  if (!/^\+?[\d\s()-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15) {
    throw new PhoneOrderError(400, 'Ange ett giltigt telefonnummer.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PhoneOrderError(400, 'Ange en giltig e-postadress.');
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100) {
    throw new PhoneOrderError(400, 'Välj minst en produkt (högst 100 orderrader).');
  }
  const items = input.items.map((item: unknown) => {
    const row = item as Record<string, unknown> | null;
    const productId = text(row?.productId, 'produkt', 120);
    if (!Number.isInteger(row?.quantity) || Number(row?.quantity) < 1 || Number(row?.quantity) > 100) {
      throw new PhoneOrderError(400, 'Antalet måste vara ett heltal mellan 1 och 100.');
    }
    return { productId, quantity: Number(row?.quantity) };
  });
  const notes = input.notes == null || input.notes === '' ? '' : text(input.notes, 'en notis på högst 500 tecken', 500);
  return { requestId, locationId, customer: { firstName, lastName, phone, email }, items, notes };
}
