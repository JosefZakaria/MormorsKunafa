import 'dotenv/config';
import type { Row } from '../db/connection.js';
import { readAllRows } from '../db/pagination.js';
import { requireExternalOutputPath, writeSensitiveArtifact } from './safe-local-artifact.js';

async function run() {
  const outputPath = requireExternalOutputPath(process.argv.slice(2));

  const orders = (await readAllRows('orders', 'id, total_ore, status')).filter(row=>row.status!=='avbruten');
  const eligible = new Set(orders.map(order=>String(order.id)));
  const orderItems = await readAllRows('order_items', 'id, order_id, product_name_snapshot, quantity, price_ore');

  const products = new Map<string, { name: string; sold_total: number; revenue_total_ore: number }>();
  for (const item of orderItems ?? []) {
    const row = item as Row;
    if (!eligible.has(String(row.order_id))) continue;
    const name = String(row.product_name_snapshot ?? 'Okänd produkt');
    const quantity = Number(row.quantity ?? 0);
    const current = products.get(name) ?? { name, sold_total: 0, revenue_total_ore: 0 };
    current.sold_total += quantity;
    current.revenue_total_ore += Number(row.price_ore ?? 0) * quantity;
    products.set(name, current);
  }

  const output = JSON.stringify({
    orders: {
      total_orders: orders?.length ?? 0,
      total_revenue: (orders ?? []).reduce((sum, row) => sum + Number((row as Row).total_ore ?? 0), 0),
    },
    products: [...products.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv')),
  }, null, 2);
  writeSensitiveArtifact(outputPath, output);
  console.log('Statistikfilen skrevs till den uttryckligen valda platsen utanför repot.');
}

run().then(() => process.exit(0)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Statistikexporten misslyckades.');
  process.exit(1);
});
