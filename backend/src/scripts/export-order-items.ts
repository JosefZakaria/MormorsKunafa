import 'dotenv/config';
import { db } from '../db/connection.js';
import fs from 'fs';

async function run() {
  const [rows] = await db.query('SELECT order_id, product_id, product_name_snapshot, quantity, price_ore FROM order_items') as any[];
  fs.writeFileSync('order_items_full.json', JSON.stringify(rows, null, 2), 'utf8');
  console.log('Written to order_items_full.json');
  process.exit(0);
}

run();
