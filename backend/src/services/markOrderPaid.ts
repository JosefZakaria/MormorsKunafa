import type { ResultSetHeader } from 'mysql2/promise';
import { db, type Row } from '../db/connection.js';
import { sendOrderConfirmationEmail } from './OrderConfirmationEmail.js';

async function getOrderById(id: string): Promise<{ order: Row; items: Row[] } | null> {
  const [orderRows] = (await db.query('SELECT * FROM orders WHERE id = ?', [id])) as [Row[], unknown];
  const orderList = Array.isArray(orderRows) ? orderRows : [];
  if (orderList.length === 0) return null;
  const [itemRows] = (await db.query('SELECT * FROM order_items WHERE order_id = ?', [id])) as [Row[], unknown];
  return { order: orderList[0], items: Array.isArray(itemRows) ? itemRows : [] };
}

export type MarkOrderPaidOptions = {
  expectedAmountOre?: number;
  paidAmountOre?: number;
};

/**
 * Sets payment_status to paid (idempotent) and sends confirmation email when applicable.
 * @returns true if the order was newly marked paid
 */
export async function markOrderPaid(orderId: string, options?: MarkOrderPaidOptions): Promise<boolean> {
  const result = await getOrderById(orderId);
  if (!result) {
    console.warn('[markOrderPaid] order not found', orderId);
    return false;
  }

  const expectedOre = options?.expectedAmountOre ?? Number(result.order.total_ore ?? 0);
  const paidOre = options?.paidAmountOre;

  if (expectedOre > 0 && paidOre != null && paidOre !== expectedOre) {
    console.error('[markOrderPaid] amount mismatch', { orderId, paidOre, expectedOre });
    return false;
  }

  const [updateResult] = (await db.query(
    `UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE id = ? AND payment_status = 'pending'`,
    [orderId]
  )) as [ResultSetHeader, unknown];

  const affected = Number(updateResult.affectedRows ?? 0);
  if (affected === 0) return false;

  const refreshed = await getOrderById(orderId);
  if (!refreshed) return true;

  const emailOut = String(refreshed.order.customer_email ?? '').trim();
  if (emailOut) {
    void sendOrderConfirmationEmail({ order: refreshed.order, items: refreshed.items }).catch((err) =>
      console.error('[order confirmation email after payment]', err)
    );
  }

  return true;
}

export async function getOrderIdBySwishInstructionId(instructionId: string): Promise<string | null> {
  const [rows] = (await db.query('SELECT id FROM orders WHERE swish_instruction_id = ? LIMIT 1', [
    instructionId,
  ])) as [Row[], unknown];
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return null;
  return String(list[0].id ?? '');
}
