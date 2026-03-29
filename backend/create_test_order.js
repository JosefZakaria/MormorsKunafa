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

  const orderId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  
  const estimatedReady = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
  
  await db.query(
    "INSERT INTO orders (id, order_number, status, order_type, payment_method, payment_status, total_ore, default_preparation_time_minutes, estimated_ready_at, created_at) VALUES (?, ?, 'mottagen', 'takeaway', 'swish', 'pending', 15000, 30, ?, NOW())",
    [orderId, '#1005', estimatedReady]
  );

  await db.query(
    "INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, quantity, price_ore) VALUES (?, ?, NULL, 'Testa-Kunafa', 1, 15000)",
    [itemId, orderId]
  );

  console.log('Skapade en rykande färsk testbeställning: ', orderId);
  await db.end();
})();
