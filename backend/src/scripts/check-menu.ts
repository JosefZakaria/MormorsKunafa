import 'dotenv/config';
import { db } from '../db/connection.js';
import fs from 'fs';

const [rows] = await db.query('SELECT name FROM products ORDER BY name ASC') as any[];
fs.writeFileSync('menu_output.json', JSON.stringify(rows, null, 2), 'utf8');
process.exit(0);
