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
         AND TABLE_NAME = 'admin_settings'
         AND COLUMN_NAME = 'rush_time_adjustment_minutes'`,
      [database]
    );

    const result = Array.isArray(rows) && rows[0] ? (rows[0] as { column_count?: number | string }) : null;
    const columnCount = Number(result?.column_count ?? 0);

    if (columnCount === 0) {
      console.log('Column rush_time_adjustment_minutes does not exist. Nothing to do.');
      return;
    }

    await conn.query('ALTER TABLE admin_settings DROP COLUMN rush_time_adjustment_minutes');
    console.log('Dropped admin_settings.rush_time_adjustment_minutes successfully.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
