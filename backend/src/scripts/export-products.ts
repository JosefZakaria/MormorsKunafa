import 'dotenv/config';
import { db } from '../db/connection.js';
import fs from 'fs';

async function run() {
  const [rows] = await db.query('SELECT * FROM products ORDER BY name ASC') as any[];
  fs.writeFileSync('products_full.json', JSON.stringify(rows, null, 2), 'utf8');
  console.log('Written to products_full.json');
  process.exit(0);
}

run();
