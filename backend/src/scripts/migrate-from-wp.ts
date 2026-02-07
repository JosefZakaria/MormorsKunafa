/**
 * One-time migration from WordPress/WooCommerce DB to Mormors Kunafa schema.
 *
 * Prerequisites:
 * 1. Restore the WordPress SQL dump into a MySQL database (e.g. same server, different database).
 * 2. Create the target database and run schema: npm run db:migrate (uses DB_*).
 * 3. Set WP_DB_* env vars to the WordPress DB and run: npm run db:seed-wp.
 *
 * Admin users are copied with a NEW bcrypt password (not WordPress hashes).
 * Temporary passwords are printed; change them after first login.
 */

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const WP_PREFIX = process.env.WP_TABLE_PREFIX ?? 'wp_';

function wpTable(name: string): string {
  return `${WP_PREFIX}${name}`;
}

function generateId(): string {
  return crypto.randomUUID();
}

function toOre(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Math.round(Number.isFinite(n) ? n * 100 : 0);
}

// Map WooCommerce order status to app status
function mapOrderStatus(wcStatus: string): string {
  const s = String(wcStatus || '').toLowerCase();
  if (s === 'wc-completed') return 'levererad';
  if (s === 'wc-processing') return 'påbörjad';
  if (s === 'wc-on-hold' || s === 'wc-pending') return 'mottagen';
  if (s === 'wc-cancelled' || s === 'wc-refunded') return 'mottagen'; // or skip; we keep as mottagen for history
  return 'mottagen';
}

async function main() {
  const wpHost = process.env.WP_DB_HOST ?? process.env.DB_HOST;
  const wpPort = Number(process.env.WP_DB_PORT || process.env.DB_PORT) || 3306;
  const wpUser = process.env.WP_DB_USER ?? process.env.DB_USER;
  const wpPassword = process.env.WP_DB_PASSWORD ?? process.env.DB_PASSWORD;
  const wpDatabase = process.env.WP_DB_DATABASE;

  if (!wpDatabase) {
    console.error('Set WP_DB_DATABASE (and optionally WP_DB_HOST, WP_DB_PORT, WP_DB_USER, WP_DB_PASSWORD) to the WordPress database.');
    process.exit(1);
  }

  const wpConn = await mysql.createConnection({
    host: wpHost ?? 'localhost',
    port: wpPort,
    user: wpUser ?? 'root',
    password: wpPassword ?? '',
    database: wpDatabase,
    charset: 'utf8mb4',
  });

  const targetConn = await mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE ?? 'mormors_kunafa',
    charset: 'utf8mb4',
  });

  try {
    const posts = wpTable('posts');
    const postmeta = wpTable('postmeta');
    const productLookup = wpTable('wc_product_meta_lookup');
    const orderStats = wpTable('wc_order_stats');
    const orderItems = wpTable('woocommerce_order_items');
    const orderItemmeta = wpTable('woocommerce_order_itemmeta');
    const users = wpTable('users');
    const usermeta = wpTable('usermeta');

    // --- Products ---
    const [productRows] = await wpConn.query(
      `SELECT p.ID, p.post_title, p.post_name, p.post_content
       FROM ${posts} p
       INNER JOIN ${productLookup} l ON p.ID = l.product_id
       WHERE p.post_type = 'product' AND p.post_status = 'publish'`
    );
    const products = Array.isArray(productRows) ? (productRows as Record<string, unknown>[]) : [];
    const productIdMap = new Map<number, string>();

    for (const row of products) {
      const wpId = Number(row.ID);
      const name = String(row.post_title || 'Unnamed').slice(0, 255);
      let slug = String(row.post_name || wpId).slice(0, 255);
      const description = String(row.post_content ?? '').slice(0, 65535);

      const [metaRows] = await wpConn.query(
        `SELECT meta_value FROM ${postmeta} WHERE post_id = ? AND meta_key = '_thumbnail_id'`,
        [wpId]
      );
      const thumbId = Array.isArray(metaRows) && (metaRows as Record<string, unknown>[]).length
        ? (metaRows as Record<string, unknown>[])[0]?.meta_value
        : null;
      let imageUrl: string | null = null;
      if (thumbId) {
        const [thumbRows] = await wpConn.query(
          `SELECT guid FROM ${posts} WHERE ID = ?`,
          [thumbId]
        );
        if (Array.isArray(thumbRows) && (thumbRows as Record<string, unknown>[]).length) {
          imageUrl = String((thumbRows as Record<string, unknown>[])[0].guid ?? '').slice(0, 512) || null;
        }
      }

      const [lookupRows] = await wpConn.query(
        `SELECT sku, min_price, max_price, stock_quantity, stock_status FROM ${productLookup} WHERE product_id = ?`,
        [wpId]
      );
      const lookup = Array.isArray(lookupRows) && (lookupRows as Record<string, unknown>[]).length
        ? (lookupRows as Record<string, unknown>[])[0]
        : {};
      const priceOre = toOre((lookup as Record<string, unknown>).min_price ?? (lookup as Record<string, unknown>).max_price);
      const stockQty = (lookup as Record<string, unknown>).stock_quantity != null
        ? Number((lookup as Record<string, unknown>).stock_quantity)
        : null;
      const stockStatus = String((lookup as Record<string, unknown>).stock_status ?? 'instock').slice(0, 20);
      const sku = (lookup as Record<string, unknown>).sku != null
        ? String((lookup as Record<string, unknown>).sku).slice(0, 100)
        : null;

      const id = generateId();
      productIdMap.set(wpId, id);

      // Ensure unique slug
      let slugAttempt = slug;
      let n = 0;
      while (true) {
        const [existing] = await targetConn.query('SELECT id FROM products WHERE slug = ?', [slugAttempt]);
        if (Array.isArray(existing) && (existing as unknown[]).length === 0) break;
        slugAttempt = `${slug}-${++n}`.slice(0, 255);
      }

      await targetConn.query(
        `INSERT INTO products (id, name, slug, description, image_url, price_ore, stock_quantity, stock_status, sku)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, slugAttempt, description, imageUrl, priceOre, stockQty, stockStatus, sku]
      );
    }
    console.log(`Migrated ${products.length} products.`);

    // --- Orders ---
    const [orderRows] = await wpConn.query(
      `SELECT order_id, date_created, status, total_sales, num_items_sold FROM ${orderStats} ORDER BY order_id ASC`
    );
    const orders = Array.isArray(orderRows) ? (orderRows as Record<string, unknown>[]) : [];
    let orderCount = 0;

    for (const o of orders) {
      const wpOrderId = Number(o.order_id);
      const dateCreated = o.date_created instanceof Date ? o.date_created : new Date(String(o.date_created));
      const wcStatus = String(o.status ?? '');
      const status = mapOrderStatus(wcStatus);
      const totalOre = toOre(o.total_sales);

      const orderId = generateId();
      const orderNumber = `#${String(wpOrderId).padStart(4, '0')}`;

      try {
        await targetConn.query(
          `INSERT INTO orders (id, order_number, status, order_type, payment_method, payment_status, total_ore, default_preparation_time_minutes, created_at, updated_at)
           VALUES (?, ?, ?, 'takeaway', 'cash', 'pending', ?, 30, ?, NOW())`,
          [orderId, orderNumber, status, totalOre, dateCreated]
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Duplicate entry') && msg.includes('order_number')) {
          // Already migrated or collision; skip
          continue;
        }
        throw err;
      }

      const [items] = await wpConn.query(
        `SELECT order_item_id, order_item_name FROM ${orderItems} WHERE order_id = ? AND order_item_type = 'line_item'`,
        [wpOrderId]
      );
      const itemList = Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
      for (const it of itemList) {
        const itemId = Number(it.order_item_id);
        const productName = String(it.order_item_name ?? 'Item').slice(0, 255);

        const [metaRows] = await wpConn.query(
          `SELECT meta_key, meta_value FROM ${orderItemmeta} WHERE order_item_id = ?`,
          [itemId]
        );
        const meta = (Array.isArray(metaRows) ? metaRows : []) as Array<{ meta_key: string; meta_value: string }>;
        const metaMap: Record<string, string> = {};
        for (const m of meta) metaMap[m.meta_key] = m.meta_value;

        const wpProductId = metaMap._product_id ? parseInt(metaMap._product_id, 10) : null;
        const productId = wpProductId != null ? productIdMap.get(wpProductId) ?? null : null;
        const qty = parseInt(metaMap._qty ?? '1', 10) || 1;
        const lineTotal = toOre(metaMap._line_total ?? 0);
        const priceOre = qty > 0 ? Math.round(lineTotal / qty) : 0;

        const lineId = generateId();
        await targetConn.query(
          `INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, quantity, price_ore)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [lineId, orderId, productId, productName, qty, priceOre]
        );
      }
      orderCount++;
    }
    console.log(`Migrated ${orderCount} orders.`);

    // --- Admin users (WordPress administrators with new passwords) ---
    const [adminRows] = await wpConn.query(
      `SELECT u.ID, u.user_email, u.display_name
       FROM ${users} u
       INNER JOIN ${usermeta} m ON u.ID = m.user_id AND m.meta_key = '${WP_PREFIX}capabilities'
       WHERE m.meta_value LIKE '%administrator%'`
    );
    const admins = Array.isArray(adminRows) ? (adminRows as Record<string, unknown>[]) : [];
    const tempPasswords: Array<{ email: string; password: string }> = [];

    for (const a of admins) {
      const email = String(a.user_email ?? '').trim().slice(0, 255);
      if (!email) continue;
      const displayName = String(a.display_name ?? email).slice(0, 255);
      const tempPassword = randomBytes(8).toString('base64').replace(/[/+=]/g, '').slice(0, 12);
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const id = generateId();

      try {
        await targetConn.query(
          `INSERT INTO admin_users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), display_name = VALUES(display_name)`,
          [id, email, passwordHash, displayName]
        );
        tempPasswords.push({ email, password: tempPassword });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Duplicate entry') && msg.includes('email')) {
          console.warn(`Admin ${email} already exists; skipping.`);
          continue;
        }
        throw err;
      }
    }
    console.log(`Migrated ${admins.length} admin users.`);
    if (tempPasswords.length > 0) {
      console.log('\nTemporary passwords (change after first login):');
      for (const { email, password } of tempPasswords) {
        console.log(`  ${email} => ${password}`);
      }
    }
  } finally {
    await wpConn.end();
    await targetConn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
