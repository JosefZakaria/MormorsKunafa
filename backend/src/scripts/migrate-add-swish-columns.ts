import 'dotenv/config';
import mysql from 'mysql2/promise';

async function main() {
  const database = process.env.DB_DATABASE ?? 'mormors_kunafa';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database,
  });

  try {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'swish_instruction_id'`,
      [database]
    );
    const exists = Array.isArray(cols) && cols.length > 0;
    if (exists) {
      console.log('Column orders.swish_instruction_id already exists. Nothing to do.');
      return;
    }

    await conn.query(
      'ALTER TABLE orders ADD COLUMN swish_instruction_id varchar(36) DEFAULT NULL AFTER stripe_checkout_session_id'
    );
    await conn.query(
      'ALTER TABLE orders ADD INDEX idx_orders_swish_instruction (swish_instruction_id)'
    );
    console.log('Added orders.swish_instruction_id successfully.');
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
