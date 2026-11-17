import { createHash } from 'node:crypto';
import { ERASABLE_RETENTION_FIELDS, type RetentionDecision, type RetentionField, type RetentionHold, type RetentionOrderPreview, type RetentionErasureInput } from '@mormors-kunafa/shared/types';
import { dbTimestampToIso } from '../utils/dbTimestamp.js';

export interface RetentionCheckout {
  id: string; orderId: string | null; status: string | null; paymentStatus: string;
  amount: number | null; currency: string | null; mode: string; liveMode: boolean;
  created: number; expiresAt: number;
}
export interface RetentionEvidence { complete: boolean; sessions: RetentionCheckout[] }
export type RetentionOrder = Record<string, unknown>;
const DAY = 86400000;
const present = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
export const RETENTION_ORDER_SELECT = 'id,order_number,status,payment_method,payment_status,total_ore,created_at,updated_at,scheduled_at,completed_at,cancelled_at,stripe_checkout_session_id,refund_status,customer_name,customer_phone,customer_email,delivery_info_json,internal_notes';
export const retentionSnapshot = (order: RetentionOrder) => Object.fromEntries(RETENTION_ORDER_SELECT.split(',').map(key => [key, order[key] ?? null]));
export const retentionVersion = (order: RetentionOrder) => createHash('sha256').update(JSON.stringify(retentionSnapshot(order))).digest('hex');

function timestamp(value: unknown): number | null {
  const iso = dbTimestampToIso(value);
  const result = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(result) ? result : null;
}

// Old drafts must stop accepting new sessions before any of their customer fields can be erased.
export function checkoutAttemptExpired(order: RetentionOrder, now = new Date()): boolean {
  const created = timestamp(order.created_at);
  return created === null || created > now.getTime() || created + 30 * DAY <= now.getTime();
}

export function previewOrderRetention(order: RetentionOrder, holds: RetentionHold[], evidence: RetentionEvidence, now: Date): RetentionOrderPreview {
  const created = timestamp(order.created_at);
  const scheduled = timestamp(order.scheduled_at);
  const delivery = order.delivery_info_json as Record<string, unknown> | null;
  const fields: RetentionField[] = ['purchase_details', 'payment_details'];
  if (present(order.customer_phone) || present(order.customer_email)) fields.push('contact');
  if (present(delivery?.phone) || present(delivery?.email)) fields.push('delivery_contact');
  if (present(order.customer_name) || ['name', 'address', 'postalCode', 'city'].some(key => present(delivery?.[key]))) fields.push('identity_address');
  if (present(order.internal_notes)) fields.push('notes');
  const orderHolds = holds.filter(hold => hold.orderId === order.id);
  const activeHolds = orderHolds.filter(hold => !hold.releasedAt);
  const sessions = evidence.sessions.filter(session => session.orderId === order.id || session.id === order.stripe_checkout_session_id);
  const isPendingCard = order.status === 'ny' && order.payment_status === 'pending' && ['card', 'app'].includes(String(order.payment_method));
  const safeDates = created !== null && created <= now.getTime()
    && (order.scheduled_at == null || (scheduled !== null && scheduled <= now.getTime()));
  const verifiedExpired = isPendingCard && safeDates && [null, undefined, 'none'].includes(order.refund_status as string | null | undefined)
    && evidence.complete && present(order.stripe_checkout_session_id) && sessions.length > 0
    && sessions.some(session => session.id === order.stripe_checkout_session_id)
    && sessions.every(session => session.orderId === order.id && session.mode === 'payment'
      && session.id.startsWith(session.liveMode ? 'cs_live_' : 'cs_test_')
      && String(order.stripe_checkout_session_id).startsWith(session.liveMode ? 'cs_live_' : 'cs_test_')
      && session.status === 'expired' && session.paymentStatus === 'unpaid'
      && Number.isSafeInteger(order.total_ore) && Number(order.total_ore) > 0
      && session.amount === order.total_ore && session.currency === 'sek'
      && Number.isFinite(session.created) && session.created * 1000 >= created! - DAY
      && session.created * 1000 <= now.getTime()
      && Number.isFinite(session.expiresAt) && session.expiresAt >= session.created
      && session.expiresAt * 1000 <= now.getTime());
  const abandonedFrom = verifiedExpired ? Math.max(created!, ...sessions.map(session => session.expiresAt * 1000)) + 30 * DAY : null;
  const year = created !== null ? Number(new Intl.DateTimeFormat('en', {year: 'numeric', timeZone: 'Europe/Stockholm'}).format(created)) : null;
  const accountingFrom = year ? `${year + 8}-01-01` : undefined;
  const decisions = fields.map((field): RetentionDecision => {
    if (activeHolds.some(hold => hold.fields.includes(field))) return {field, status: 'hold', rule: 'case_hold',
      reason: 'Undantaget från gallring tills superadmin avslutar ärendet. Omprövningsdatum är inte ett slutdatum.'};
    if (field === 'purchase_details' || field === 'payment_details') return {field, status: 'preserve', rule: 'accounting_calendar_year', eligibleFrom: accountingFrom,
      reason: 'Bevaras tills bokföringsbehovet är bedömt. Datumet är preliminärt från orderns skapandeår; senare affärshändelser kan kräva längre bevarande. Ingen automatisk radering.'};
    if (abandonedFrom !== null) return {field, status: abandonedFrom <= now.getTime() ? 'candidate' : 'waiting', rule: 'abandoned_30_days',
      eligibleFrom: new Date(abandonedFrom).toISOString(),
      reason: 'Alla matchande Checkout-sessioner är utgångna och obetalda. Bekräfta före gallring att valda uppgifter inte behövs för bokföring, leverans, fordran eller ett pågående ärende.'};
    if (field === 'identity_address') return {field, status: 'review', rule: 'accounting_identity',
      reason: 'Kontrollera vilken kundidentifiering bokföringsunderlaget kräver innan namn eller adress tas bort.'};
    if (field === 'notes') return {field, status: 'review', rule: 'work_notes_90_days',
      reason: 'Förslaget 90 dagar gäller rena arbetsanteckningar efter avslutad order. Blandad fritext och avsaknad av säkert avslutsdatum kräver bedömning.'};
    return {field, status: 'review', rule: 'contact_up_to_3_years',
      reason: isPendingCard ? 'Betalningsförsöket är inte verifierat som övergivet. Saknad referens, avvikelse eller ofullständig Stripe-kontroll kräver bedömning.'
        : 'Högst 3 år endast vid dokumenterat behov, kortare när behovet upphör. Säkert avslutsdatum och pågående ärenden måste bedömas; köksklar/updated_at räcker inte.'};
  });
  return {id: String(order.id), orderNumber: String(order.order_number ?? ''), status: String(order.status), paymentStatus: String(order.payment_status),
    createdAt: created === null ? null : new Date(created).toISOString(), version: retentionVersion(order), holds: orderHolds, decisions};
}

export class RetentionError extends Error {
  constructor(message: string, public status = 400) {super(message);}
}

export function planOrderErasure(order: RetentionOrder, holds: RetentionHold[], evidence: RetentionEvidence, value: unknown, now: Date) {
  const input = value as RetentionErasureInput;
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['fields','version','confirmedNoAccountingNeed','closedOn','notesOperationalOnly','purposeEnded'].includes(key))
    || !Array.isArray(input.fields) || input.fields.length < 1 || input.fields.length > 4
    || new Set(input.fields).size !== input.fields.length || input.fields.some(field => !ERASABLE_RETENTION_FIELDS.includes(field))
    || input.confirmedNoAccountingNeed !== true
    || (input.notesOperationalOnly !== undefined && typeof input.notesOperationalOnly !== 'boolean')
    || (input.purposeEnded !== undefined && typeof input.purposeEnded !== 'boolean')) {
    throw new RetentionError('Välj kunduppgifter och bekräfta att de inte behövs för bokföring, leverans, fordran eller pågående ärende.');
  }
  if (input.version !== retentionVersion(order)) throw new RetentionError('Ordern har ändrats. Läs om gallringskontrollen.', 409);
  const preview = previewOrderRetention(order, holds, evidence, now);
  const selected = input.fields.map(field => preview.decisions.find(decision => decision.field === field));
  if (selected.some(decision => !decision || decision.status === 'hold')) throw new RetentionError('Valda uppgifter saknas eller omfattas av ett aktivt undantag.', 409);
  if (input.fields.includes('notes') && input.notesOperationalOnly !== true) throw new RetentionError('Bekräfta att anteckningen bara innehåller arbetsinstruktioner.');
  if (selected.every(decision => decision!.rule === 'abandoned_30_days' && decision!.status === 'candidate')) {
    return {rule: 'abandoned_30_days' as const, fields: input.fields,
      lastExpiry: new Date(Date.parse(selected[0]!.eligibleFrom!) - 30 * DAY).toISOString(), closedOn: null, notesOperationalOnly: input.notesOperationalOnly === true};
  }
  if (!['klar','uthämtad','levererad','avbruten'].includes(String(order.status))
    || (order.status !== 'avbruten' && order.payment_status !== 'paid')
    || ![null, undefined, 'none', 'refunded'].includes(order.refund_status as string | null | undefined)
    || (input.purposeEnded === true && order.payment_status !== 'paid')
    || input.fields.includes('identity_address')) throw new RetentionError('Ordern är inte verifierat avslutad eller uppgifterna behöver skyddas.');
  if ((input.fields.includes('contact') || input.fields.includes('delivery_contact')) && !present(order.customer_name)
    && !present((order.delivery_info_json as Record<string, unknown> | null)?.name)) throw new RetentionError('Kundidentifieringen behöver bedömas innan kontaktuppgifterna tas bort.');
  const closedOn = input.closedOn;
  if (typeof closedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(closedOn)
    || !Number.isFinite(Date.parse(closedOn)) || new Date(closedOn).toISOString().slice(0, 10) !== closedOn) throw new RetentionError('Ange ett giltigt, bekräftat avslutsdatum. Köksklar räcker inte.');
  const today = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Stockholm'}).format(now);
  for (const key of ['created_at','scheduled_at','completed_at','cancelled_at']) {
    if (order[key] == null && key !== 'created_at') continue;
    const date = timestamp(order[key]);
    if (date === null || closedOn < new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Stockholm'}).format(date)) throw new RetentionError('Avslutsdatumet motsäger orderns registrerade datum.');
  }
  const [year, month, day] = closedOn.split('-').map(Number);
  const contactFrom = new Date(Date.UTC(year + 3, month - 1, Math.min(day, new Date(Date.UTC(year + 3, month, 0)).getUTCDate()))).toISOString().slice(0, 10);
  const notesFrom = new Date(Date.parse(closedOn) + 90 * DAY).toISOString().slice(0, 10);
  if (closedOn > today || (input.purposeEnded !== true && input.fields.some(field => today < (field === 'notes' ? notesFrom : contactFrom)))) throw new RetentionError('Ordinarie tidsgräns har inte passerat: 3 år för kontaktuppgifter och 90 dagar för arbetsanteckningar. Tidigare gallring kräver individuell bedömning att behovet upphört.');
  return {rule: input.purposeEnded === true ? 'purpose_ended' as const : 'closed_order' as const, fields: input.fields, lastExpiry: null, closedOn, notesOperationalOnly: input.notesOperationalOnly === true};
}
