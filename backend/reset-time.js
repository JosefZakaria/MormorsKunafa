import 'dotenv/config';
import mysql from 'mysql2/promise';

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE,
  });
  
  const newDate = new Date(Date.now() + 15 * 60 * 1000);
  await db.query("UPDATE orders SET estimated_ready_at = ? WHERE status IN ('mottagen', 'påbörjad')", [newDate]);

  console.log('Tid återställd till 15 min framåt.');
  await db.end();
})();
