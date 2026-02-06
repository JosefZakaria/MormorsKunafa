/**
 * Reads the WordPress SQL dump file, extracts products (wp_posts + wp_wc_product_meta_lookup
 * + wp_postmeta for images), and writes a new .sql file with INSERT statements for the
 * `products` table. Run the generated file in phpMyAdmin to complete the menu migration.
 *
 * Usage: npx tsx src/scripts/generate-product-sql.ts [path-to-wp-dump.sql] [output.sql]
 * Default: Database/845466_f2374cba400138f050cfb9bde30d163e.sql -> backend/generated-products.sql
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const WP_PREFIX = 'wp_';

// --- Parse MySQL INSERT VALUES (handle quoted strings and nested parens) ---

function findEndOfInsert(content: string, start: number): number {
  let i = start;
  let inString = false;
  let escaped = false;
  let depth = 0;
  while (i < content.length) {
    const c = content[i];
    if (escaped) {
      escaped = false;
      i++;
      continue;
    }
    if (inString) {
      if (c === "'" && content[i + 1] === "'") {
        i += 2;
        continue;
      }
      if (c === "'") {
        inString = false;
        i++;
        continue;
      }
      if (c === '\\') escaped = true;
      i++;
      continue;
    }
    if (c === "'") {
      inString = true;
      i++;
      continue;
    }
    if (c === '(') {
      depth++;
      i++;
      continue;
    }
    if (c === ')') {
      depth--;
      i++;
      continue;
    }
    if (c === ';' && depth === 0) return i;
    i++;
  }
  return -1;
}

function extractValuesPart(content: string, tableName: string): string | null {
  const needle = `INSERT INTO \`${tableName}\` `;
  const idx = content.indexOf(needle);
  if (idx === -1) return null;
  const valuesIdx = content.indexOf('VALUES ', idx);
  if (valuesIdx === -1) return null;
  const start = valuesIdx + 7;
  const end = findEndOfInsert(content, start);
  if (end === -1) return null;
  return content.slice(start, end).trim();
}

function splitRows(valuesStr: string): string[] {
  const rows: string[] = [];
  let depth = 0;
  let inString = false;
  let i = 0;
  let rowStart = 0;
  while (i < valuesStr.length) {
    const c = valuesStr[i];
    if (inString) {
      if (c === "'" && valuesStr[i + 1] === "'") {
        i += 2;
        continue;
      }
      if (c === "'") {
        inString = false;
        i++;
        continue;
      }
      i++;
      continue;
    }
    if (c === "'") {
      inString = true;
      i++;
      continue;
    }
    if (c === '(') {
      depth++;
      if (depth === 1) rowStart = i;
      i++;
      continue;
    }
    if (c === ')') {
      depth--;
      if (depth === 0) {
        rows.push(valuesStr.slice(rowStart, i + 1));
      }
      i++;
      continue;
    }
    i++;
  }
  return rows;
}

function parseRow(rowStr: string): string[] {
  // rowStr is (col1, col2, ...) - strip outer parens then split by comma at depth 0
  const inner = rowStr.slice(1, -1).trim();
  const cols: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let i = 0; i <= inner.length; i++) {
    const c = inner[i] ?? ',';
    if (inString) {
      if (c === "'" && inner[i + 1] === "'") {
        i++;
        continue;
      }
      if (c === "'") inString = false;
      continue;
    }
    if (c === "'") {
      inString = true;
      continue;
    }
    if (c === '(') {
      depth++;
      continue;
    }
    if (c === ')') depth--;
    if ((c === ',' && depth === 0) || i === inner.length) {
      let val = inner.slice(start, i).trim();
      if (val === 'NULL') cols.push('');
      else if (val.startsWith("'")) {
        val = val.slice(1, -1).replace(/''/g, "'").replace(/\\'/g, "'");
        cols.push(val);
      } else cols.push(val);
      start = i + 1;
    }
  }
  return cols;
}

function collectAllInsertValues(content: string, tableName: string): string[] {
  const allRows: string[] = [];
  const needle = `INSERT INTO \`${tableName}\``;
  let searchStart = 0;
  while (true) {
    const idx = content.indexOf(needle, searchStart);
    if (idx === -1) break;
    const afterColumns = content.indexOf(') VALUES', idx);
    if (afterColumns === -1) break;
    const start = content.indexOf('(', afterColumns);
    if (start === -1 || start <= afterColumns) break;
    const end = findEndOfInsert(content, start);
    if (end === -1) break;
    const valuesStr = content.slice(start, end).trim();
    const rows = splitRows(valuesStr);
    allRows.push(...rows);
    searchStart = end + 1;
  }
  return allRows;
}

// wp_posts INSERT columns: ID, post_author, post_date, post_date_gmt, post_content, post_title, post_excerpt, post_status, ...
const POSTS_ID = 0;
const POSTS_POST_TITLE = 5;
const POSTS_POST_NAME = 11;
const POSTS_POST_CONTENT = 4;
const POSTS_POST_STATUS = 7;
const POSTS_GUID = 18;
const POSTS_POST_TYPE = 20;

// wp_wc_product_meta_lookup: product_id, sku, virtual, downloadable, min_price, max_price, ...
const LOOKUP_PRODUCT_ID = 0;
const LOOKUP_SKU = 1;
const LOOKUP_MIN_PRICE = 4;
const LOOKUP_MAX_PRICE = 5;
const LOOKUP_STOCK_QUANTITY = 7;
const LOOKUP_STOCK_STATUS = 8;

// wp_postmeta: meta_id, post_id, meta_key, meta_value
const META_POST_ID = 1;
const META_KEY = 2;
const META_VALUE = 3;

function escapeSql(s: string): string {
  if (s == null || s === '') return 'NULL';
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function toOre(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Math.round(Number.isFinite(n) ? n * 100 : 0);
}

function main() {
  const repoRoot = resolve(__dirname, '..', '..', '..');
  const defaultInput = join(repoRoot, 'Database', '845466_f2374cba400138f050cfb9bde30d163e.sql');
  const defaultOutput = join(repoRoot, 'backend', 'generated-products.sql');

  const inputPath = resolve(process.argv[2] ?? defaultInput);
  const outputPath = resolve(process.argv[3] ?? defaultOutput);

  console.log('Reading dump:', inputPath);
  const content = readFileSync(inputPath, 'utf-8');
  console.log('Dump size:', (content.length / 1024 / 1024).toFixed(2), 'MB');

  const postsTable = `${WP_PREFIX}posts`;
  const lookupTable = `${WP_PREFIX}wc_product_meta_lookup`;
  const metaTable = `${WP_PREFIX}postmeta`;

  const postsRows = collectAllInsertValues(content, postsTable);
  const lookupRows = collectAllInsertValues(content, lookupTable);
  const metaRows = collectAllInsertValues(content, metaTable);

  console.log('Parsed rows: posts=', postsRows.length, 'lookup=', lookupRows.length, 'meta=', metaRows.length);

  const postsById = new Map<number, string[]>();
  const attachmentsById = new Map<number, string[]>();
  for (const row of postsRows) {
    const cols = parseRow(row);
    if (cols.length <= POSTS_POST_TYPE) continue;
    const id = parseInt(cols[POSTS_ID], 10);
    const postType = (cols[POSTS_POST_TYPE] ?? '').trim();
    const postStatus = (cols[POSTS_POST_STATUS] ?? '').trim();
    if (postType === 'product' && postStatus === 'publish') {
      postsById.set(id, cols);
    }
    if (postType === 'attachment') {
      attachmentsById.set(id, cols);
    }
  }
  const lookupByProductId = new Map<number, string[]>();
  for (const row of lookupRows) {
    const cols = parseRow(row);
    const productId = parseInt(cols[LOOKUP_PRODUCT_ID], 10);
    lookupByProductId.set(productId, cols);
  }

  const thumbnailByPostId = new Map<number, number>();
  for (const row of metaRows) {
    const cols = parseRow(row);
    const postId = parseInt(cols[META_POST_ID], 10);
    const key = (cols[META_KEY] ?? '').trim();
    const val = cols[META_VALUE] ?? '';
    if (key === '_thumbnail_id') {
      const thumbId = parseInt(val, 10);
      if (Number.isFinite(thumbId)) thumbnailByPostId.set(postId, thumbId);
    }
  }

  const productIds = [...postsById.keys()].filter((id) => lookupByProductId.has(id));
  if (productIds.length === 0) {
    console.warn('No products found. Ensure the dump has wp_posts (post_type=product, post_status=publish) and wp_wc_product_meta_lookup.');
  }
  const slugs = new Set<string>();

  const inserts: string[] = [];
  inserts.push('-- Generated by generate-product-sql.ts from WordPress dump');
  inserts.push('-- Run this in phpMyAdmin on your products table.');
  inserts.push('SET NAMES utf8mb4;');
  inserts.push('');

  for (const wpId of productIds) {
    const postCols = postsById.get(wpId)!;
    const lookupCols = lookupByProductId.get(wpId)!;

    const name = (postCols[POSTS_POST_TITLE] ?? 'Unnamed').slice(0, 255);
    let slug = (postCols[POSTS_POST_NAME] ?? String(wpId)).slice(0, 255);
    const description = (postCols[POSTS_POST_CONTENT] ?? '').slice(0, 65535);

    let imageUrl: string | null = null;
    const thumbId = thumbnailByPostId.get(wpId);
    if (thumbId != null) {
      const att = attachmentsById.get(thumbId);
      if (att) imageUrl = (att[POSTS_GUID] ?? '').slice(0, 512) || null;
    }

    const minPrice = lookupCols[LOOKUP_MIN_PRICE];
    const maxPrice = lookupCols[LOOKUP_MAX_PRICE];
    const priceOre = toOre(minPrice || maxPrice);
    const stockQtyRaw = lookupCols[LOOKUP_STOCK_QUANTITY];
    const stockQuantity = stockQtyRaw !== '' && stockQtyRaw !== 'NULL' ? parseInt(stockQtyRaw, 10) : null;
    const stockStatus = (lookupCols[LOOKUP_STOCK_STATUS] ?? 'instock').slice(0, 20);
    const sku = (lookupCols[LOOKUP_SKU] ?? '').slice(0, 100) || null;

    while (slugs.has(slug)) {
      slug = `${slug}-${wpId}`.slice(0, 255);
    }
    slugs.add(slug);

    const id = generateUuid();
    const row = [
      escapeSql(id),
      escapeSql(name),
      escapeSql(slug),
      escapeSql(description),
      imageUrl ? escapeSql(imageUrl) : 'NULL',
      String(priceOre),
      stockQuantity != null ? String(stockQuantity) : 'NULL',
      escapeSql(stockStatus),
      sku ? escapeSql(sku) : 'NULL',
    ];
    inserts.push(
      `INSERT INTO \`products\` (\`id\`, \`name\`, \`slug\`, \`description\`, \`image_url\`, \`price_ore\`, \`stock_quantity\`, \`stock_status\`, \`sku\`) VALUES (${row.join(', ')});`
    );
  }

  const out = inserts.join('\n');
  writeFileSync(outputPath, out, 'utf-8');
  console.log(`Wrote ${productIds.length} product INSERTs to ${outputPath}`);
}

main();
