import 'dotenv/config';
import { supabase, logSupabaseError, nowIso, type Row } from '../db/connection.js';
import { SITE_MEDIA_BUCKET, compressProductImage, uploadSiteMedia } from '../services/siteMedia.js';

// Re-encodes product images already in site-media (uploaded before compression existed).
// Dry run by default; pass --apply to write. Originals are never deleted, so the printed
// old URLs are enough to roll back. Hero images and external (WordPress) URLs are skipped.
const apply = process.argv.includes('--apply');

async function main() {
  const prefix = `${process.env.SUPABASE_URL?.trim().replace(/\/$/, '')}/storage/v1/object/public/${SITE_MEDIA_BUCKET}/`;
  const { data, error } = await supabase.from('products').select('id, name, image_url').like('image_url', `${prefix}%`);
  if (error) {
    logSupabaseError('compress-product-images select', error);
    throw error;
  }

  const rows = ((data ?? []) as Row[]).filter((r) => !/\.webp(\?|$)/.test(String(r.image_url)));
  console.log(`${rows.length} product image(s) to compress${apply ? '' : ' (dry run, pass --apply to write)'}`);

  for (const row of rows) {
    const oldUrl = String(row.image_url);
    const response = await fetch(oldUrl);
    if (!response.ok) {
      console.warn(`skip ${row.name}: download failed (${response.status})`);
      continue;
    }
    const original = Buffer.from(await response.arrayBuffer());
    const compressed = await compressProductImage(original);
    const kb = (n: number) => `${Math.round(n / 1024)} kB`;
    console.log(`${row.name}: ${kb(original.length)} -> ${kb(compressed.length)}`);
    if (!apply) continue;

    const url = await uploadSiteMedia({
      path: `products/${row.id}/${Date.now()}.webp`,
      buffer: compressed,
      contentType: 'image/webp',
      upsert: false,
    });
    const { error: updateError } = await supabase
      .from('products')
      .update({ image_url: url, updated_at: nowIso() })
      .eq('id', row.id)
      .eq('image_url', oldUrl); // don't clobber an image the admin replaced meanwhile
    if (updateError) {
      logSupabaseError('compress-product-images update', updateError);
      throw updateError;
    }
    console.log(`  old: ${oldUrl}\n  new: ${url}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
