import type { Router } from 'express';
import { RETENTION_FIELD_LABELS, RETENTION_REASON_LABELS, type RetentionField, type RetentionHold, type RetentionHoldInput, type RetentionPreview } from '@mormors-kunafa/shared/types';
import { supabase, type Row } from '../db/connection.js';
import { requireAdmin, requireOwner, getRequestAdmin } from '../middleware/auth.js';
import { previewOrderRetention, planOrderErasure, RetentionError, retentionSnapshot, RETENTION_ORDER_SELECT } from '../services/orderRetention.js';
import { readRetentionCheckoutEvidence } from '../services/retentionStripe.js';

const PAGE_SIZE = 50;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function holdFromRow(row: Row): RetentionHold {
  return {id: String(row.id), orderId: String(row.order_id), fields: row.fields as RetentionField[],
    reason: row.reason as RetentionHold['reason'], responsibleName: String(row.responsible_name), reviewOn: String(row.review_on),
    createdAt: String(row.created_at), releasedAt: row.released_at == null ? null : String(row.released_at)};
}

async function loadHolds(orderIds: string[]): Promise<RetentionHold[]> {
  if (!orderIds.length) return [];
  const result = await supabase.from('order_retention_holds').select('*', {count: 'exact'})
    .in('order_id', orderIds).order('created_at', {ascending: false}).limit(1000);
  if (result.error || result.count == null || result.count > (result.data?.length ?? 0)) throw new Error('Incomplete holds read');
  return (result.data ?? []).map(holdFromRow);
}

function parseHold(value: unknown): RetentionHoldInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['fields', 'reason', 'reviewOn'].includes(key))) return null;
  if (!Array.isArray(body.fields) || body.fields.length < 1 || body.fields.length > 6
    || new Set(body.fields).size !== body.fields.length
    || body.fields.some(field => typeof field !== 'string' || !Object.hasOwn(RETENTION_FIELD_LABELS, field))) return null;
  if (typeof body.reason !== 'string' || !Object.hasOwn(RETENTION_REASON_LABELS, body.reason)) return null;
  if (typeof body.reviewOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.reviewOn)) return null;
  const date = new Date(`${body.reviewOn}T12:00:00Z`);
  const today = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Stockholm'}).format(new Date());
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== body.reviewOn || body.reviewOn < today) return null;
  return body as unknown as RetentionHoldInput;
}

export function registerRetentionRoutes(router: Router): void {
  router.get('/admin/retention-preview', requireAdmin, requireOwner, async (req, res) => {
    const pageValue = req.query.page ?? '1';
    if (typeof pageValue !== 'string' || !/^[1-9]\d{0,5}$/.test(pageValue)) {
      res.status(400).json({error: 'Ogiltigt sidnummer.'}); return;
    }
    const page = Number(pageValue);
    try {
      const {data, error, count} = await supabase.from('orders').select(RETENTION_ORDER_SELECT, {count: 'exact'})
        .order('created_at', {ascending: false}).order('id', {ascending: true})
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (error || count == null) throw error ?? new Error('Missing order count');
      const rows = (data ?? []) as Row[];
      const holds = await loadHolds(rows.map(row => String(row.id)));
      const now = new Date();
      const evidence = await readRetentionCheckoutEvidence(rows, now);
      const preview: RetentionPreview = {readOnly: true, generatedAt: now.toISOString(), page, pageSize: PAGE_SIZE, total: count,
        ...(!evidence.complete ? {warning: 'Stripe-kontrollen kunde inte slutföras. Berörda köp kräver manuell bedömning.'} : {}),
        orders: rows.map(row => previewOrderRetention(row, holds, evidence, now))};
      res.json(preview);
    } catch {
      console.error('[retention preview] read failed');
      res.status(503).json({error: 'Förhandsgranskningen kunde inte läsas säkert. Kontrollera att migrationen är installerad och försök igen.'});
    }
  });

  router.post('/admin/:id/retention-erase', requireAdmin, requireOwner, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) {res.status(400).json({error: 'Ogiltig order.'}); return;}
    try {
      const result = await supabase.from('orders').select(RETENTION_ORDER_SELECT).eq('id', id).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) {res.status(404).json({error: 'Ordern finns inte.'}); return;}
      const order = result.data as Row;
      const holds = await loadHolds([id]);
      const now = new Date();
      const evidence = await readRetentionCheckoutEvidence([order], now);
      const plan = planOrderErasure(order, holds, evidence, req.body, now);
      const outcome = await supabase.rpc('apply_order_retention', {
        p_order_id: id, p_expected: retentionSnapshot(order), p_fields: plan.fields, p_rule: plan.rule,
        p_admin_id: getRequestAdmin(req)!.adminId, p_confirmed: true, p_closed_on: plan.closedOn,
        p_notes_operational: plan.notesOperationalOnly, p_last_expiry: plan.lastExpiry,
      });
      if (outcome.error) {
        if (outcome.error.code === '40001') throw new RetentionError('Ordern eller undantagen har ändrats. Läs om gallringskontrollen.', 409);
        if (outcome.error.code === '22023') throw new RetentionError('Valda uppgifter klarade inte databasens gallringskontroll. Läs om och kontrollera datum och villkor.');
        throw outcome.error;
      }
      if (!outcome.data?.runId) throw new Error('Missing erasure receipt');
      res.json(outcome.data);
    } catch (cause) {
      if (cause instanceof RetentionError) {res.status(cause.status).json({error: cause.message}); return;}
      console.error('[retention erase] operation could not be confirmed');
      res.status(503).json({error: 'Gallringen kunde inte bekräftas. Läs om kontrollen och granska körloggen innan du försöker igen.'});
    }
  });

  router.post('/admin/:id/retention-holds', requireAdmin, requireOwner, async (req, res) => {
    const id = String(req.params.id);
    const body = parseHold(req.body);
    if (!UUID.test(id) || !body) {res.status(400).json({error: 'Välj berörda uppgifter, anledning och ett giltigt omprövningsdatum.'}); return;}
    try {
      const order = await supabase.from('orders').select('id').eq('id', id).maybeSingle();
      if (order.error) throw order.error;
      if (!order.data) {res.status(404).json({error: 'Ordern finns inte.'}); return;}
      const admin = getRequestAdmin(req)!;
      const result = await supabase.from('order_retention_holds').insert({order_id: id, fields: body.fields, reason: body.reason,
        review_on: body.reviewOn, responsible_admin_id: admin.adminId, responsible_name: admin.session?.name || admin.email})
        .select('*').single();
      if (result.error || !result.data) throw result.error;
      res.status(201).json(holdFromRow(result.data));
    } catch {
      console.error('[retention hold] insert failed');
      res.status(503).json({error: 'Undantaget kunde inte sparas. Inga orderuppgifter har ändrats.'});
    }
  });

  router.patch('/admin/retention-holds/:id/release', requireAdmin, requireOwner, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id) || (req.body && Object.keys(req.body).length)) {res.status(400).json({error: 'Ogiltigt undantag.'}); return;}
    try {
      const admin = getRequestAdmin(req)!;
      const result = await supabase.from('order_retention_holds')
        .update({released_at: new Date().toISOString(), released_by: admin.adminId})
        .eq('id', id).is('released_at', null).select('id');
      if (result.error) throw result.error;
      // Ending an already-ended exception must not change its original end time.
      if (!result.data?.length) {
        const previous = await supabase.from('order_retention_holds').select('id').eq('id', id).maybeSingle();
        if (previous.error) throw previous.error;
        if (!previous.data) {res.status(404).json({error: 'Undantaget finns inte.'}); return;}
      }
      res.json({ok: true});
    } catch {
      console.error('[retention hold] release failed');
      res.status(503).json({error: 'Undantaget kunde inte avslutas. Läs om förhandsgranskningen innan du försöker igen.'});
    }
  });
}
