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
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS column_count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'orders'
         AND COLUMN_NAME = 'stripe_checkout_session_id'`,
      [database]
    );

    const result = Array.isArray(rows) && rows[0] ? (rows[0] as { column_count?: number | string }) : null;
    const columnCount = Number(result?.column_count ?? 0);

    if (columnCount > 0) {
      console.log('Column orders.stripe_checkout_session_id already exists. Nothing to do.');
      return;
    }

    await conn.query(
      'ALTER TABLE orders ADD COLUMN stripe_checkout_session_id varchar(255) DEFAULT NULL AFTER payment_status'
    );
    console.log('Added orders.stripe_checkout_session_id successfully.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
