import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import sharp from 'sharp';

const photo = (width, height, options = {}) =>
  sharp({ create: { width, height, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } } })
    .jpeg(options)
    .toBuffer();

test('product images are shrunk to WebP within the max size', async () => {
  const { compressProductImage, PRODUCT_IMAGE_MAX_PX, sniffImageKind } = await import('../dist/services/siteMedia.js');

  const large = await photo(4000, 3000, { quality: 95 });
  const out = await compressProductImage(large);
  const meta = await sharp(out).metadata();
  assert.equal(sniffImageKind(out), 'webp');
  assert.deepEqual([meta.width, meta.height], [PRODUCT_IMAGE_MAX_PX, 900]);
  assert.ok(out.length < large.length / 4, `${out.length} vs ${large.length}`);

  const tall = await sharp(await compressProductImage(await photo(1000, 3000))).metadata();
  assert.deepEqual([tall.width, tall.height], [400, 1200]);

  const small = await sharp(await compressProductImage(await photo(300, 200))).metadata();
  assert.deepEqual([small.width, small.height], [300, 200], 'small images are not enlarged');

  // EXIF orientation 6 = rotate 90°; a phone portrait stored landscape must come out portrait.
  const rotated = await sharp(await photo(800, 400, {})).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const upright = await sharp(await compressProductImage(rotated)).metadata();
  assert.deepEqual([upright.width, upright.height], [400, 800]);

  await assert.rejects(compressProductImage(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01])));
});

test('upload route compresses product images, keeps hero images and caches for a year', async t => {
  const uploads = [];
  const database = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/rest/v1/admin_users') return res.end(JSON.stringify([{ id: 'owner', role: 'owner', location_id: null }]));
    if (url.pathname === '/storage/v1/bucket') return res.end(JSON.stringify([{ id: 'site-media', name: 'site-media' }]));
    if (url.pathname.startsWith('/storage/v1/object/site-media/')) {
      uploads.push({ path: url.pathname.slice('/storage/v1/object/site-media/'.length), headers: req.headers, body: Buffer.concat(chunks) });
      return res.end(JSON.stringify({ Key: url.pathname }));
    }
    if (url.pathname === '/rest/v1/admin_settings') return res.end(JSON.stringify([{ id: 'settings' }]));
    if (url.pathname === '/rest/v1/locations') return res.end('[]');
    res.statusCode = 404;
    res.end(JSON.stringify({ message: `unexpected ${req.method} ${url.pathname}` }));
  }).listen(0, '127.0.0.1');
  await once(database, 'listening');
  process.env.SUPABASE_URL = `http://127.0.0.1:${database.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-site-media-test-only';
  process.env.JWT_SECRET = 'isolated-site-media-test-secret-at-least-32-chars';
  const { signToken } = await import('../dist/middleware/auth.js');
  const { registerAdminMediaRoutes } = await import('../dist/routes/adminMedia.js');
  const app = express();
  const router = express.Router();
  registerAdminMediaRoutes(router);
  app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const send = async (kind, file) => {
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', new Blob([file], { type: 'image/jpeg' }), 'photo.jpg');
    return fetch(`http://127.0.0.1:${server.address().port}/uploads`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${signToken({ adminId: 'owner', email: 'owner@example.invalid', role: 'owner' })}` },
      body: form,
    });
  };
  try {
    const original = await photo(1600, 1600, { quality: 90 });

    const product = await send('product', original);
    assert.equal(product.status, 200, await product.clone().text());
    const stored = uploads.at(-1);
    assert.match(stored.path, /^products\/[^/]+\/\d+\.webp$/);
    assert.match((await product.json()).url, /\.webp\?v=\d+$/);
    assert.ok(stored.body.includes(Buffer.from('WEBP')), 'stored bytes are WebP');
    assert.equal((await sharp(stored.body.subarray(stored.body.indexOf("RIFF"))).metadata()).width, 1200);
    assert.equal(stored.headers['cache-control'], 'max-age=31536000');

    const hero = await send('hero-desktop', original);
    assert.equal(hero.status, 200, await hero.clone().text());
    const heroStored = uploads.at(-1);
    assert.match(heroStored.path, /^hero\/desktop-\d+\.jpg$/);
    assert.ok(heroStored.body.includes(original), 'hero bytes are uploaded unchanged');

    const broken = await send('product', Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]));
    assert.equal(broken.status, 400);
    assert.equal(uploads.length, 2, 'a broken image is never stored');
  } finally {
    server.close(); database.close();
    server.closeAllConnections(); database.closeAllConnections();
    await Promise.all([once(server, 'close'), once(database, 'close')]);
  }
});
