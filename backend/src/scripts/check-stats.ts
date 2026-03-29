import 'dotenv/config';
import { db } from '../db/connection.js';
import fs from 'fs';

const [orderRows] = await db.query(`
  SELECT COUNT(*) AS total_orders, SUM(total_ore) AS total_revenue FROM orders WHERE status NOT IN ('avbruten')
`) as any[];

const [itemRows] = await db.query(`
  SELECT oi.product_name_snapshot AS name, SUM(oi.quantity) AS sold_total, SUM(oi.price_ore * oi.quantity) AS revenue_total_ore
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.status NOT IN ('avbruten')
  GROUP BY oi.product_name_snapshot
  ORDER BY name ASC
`) as any[];

const output = JSON.stringify({ orders: orderRows[0], products: itemRows }, null, 2);
fs.writeFileSync('stats_output.json', output, 'utf8');
console.log('Written to stats_output.json');
console.log(output);

process.exit(0);
