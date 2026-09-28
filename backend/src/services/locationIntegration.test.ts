import test from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import { orderVisibleToScope, parseAdminRole, type AdminScope } from './locationScope.js';
import { registerRealtimeClient, broadcastOrderCreated, type OrderCreatedEvent } from './realtimeEvents.js';
import { normalizeSiteMediaUrl } from '../utils/siteMediaUrl.js';
import { applyAdminSettingsPatch } from '../db/adminSettings.js';

const owner: AdminScope = { adminId: 'synthetic', role: 'owner', locationId: null, fulfillsDelivery: false };
const local: AdminScope = { ...owner, role: 'location', locationId: 'hoja', fulfillsDelivery: true };
test('unknown roles fail closed and location staff cannot cross locations', () => {
  for (const role of [undefined, null, '', 'admin']) assert.equal(parseAdminRole(role), null);
  assert.equal(orderVisibleToScope(local, { orderType: 'takeaway', locationId: 'mollevangen' }), false);
  assert.equal(orderVisibleToScope(local, { orderType: 'takeaway', locationId: 'hoja' }), true);
  assert.equal(orderVisibleToScope(local, { orderType: 'delivery', locationId: null }), true);
  assert.equal(orderVisibleToScope({ ...local, fulfillsDelivery: false }, { orderType: 'delivery' }), false);
});

test('open SSE connections recheck role and revocation before publishing an order', async () => {
  const writes: string[] = [];
  let ended = false;
  let revoked = false;
  const res = { write: (s: string) => writes.push(s), end: () => { ended = true; } } as unknown as Response;
  const cleanup = registerRealtimeClient(owner, res, async () => {
    if (revoked) throw new Error('Session revoked');
    return local;
  });
  const event: OrderCreatedEvent = { event_id: 'event', event_type: 'ORDER_CREATED', order_id: 'order',
    order_number: '#0001', created_at: '2026-09-08', order_type: 'takeaway', location_id: 'mollevangen' };
  try {
    writes.length = 0;
    await broadcastOrderCreated(event);
    assert.equal(writes.length, 0);
    await broadcastOrderCreated({ ...event, location_id: 'hoja' });
    assert(writes.join('').includes('ORDER_CREATED'));
    writes.length = 0;
    revoked = true;
    await broadcastOrderCreated({ ...event, location_id: 'hoja' });
    assert.equal(writes.length, 0);
    assert.equal(ended, true);
  } finally { cleanup(); }
});

test('uploaded media is normalized only for the configured bucket and safe paths', () => {
  const origin = 'https://synthetic.supabase.co';
  assert.equal(normalizeSiteMediaUrl(origin + '/storage/v1/object/public/site-media/hero/desktop-123.jpg?v=42', origin), '/api/media/hero/desktop-123.jpg');
  for (const url of ['https://evil.test/hero/desktop-123.jpg', '/api/media/../private.jpg',
    origin + '/storage/v1/object/public/private/hero/desktop-123.jpg', '/api/media/hero/desktop-123.svg']) {
    assert.equal(normalizeSiteMediaUrl(url, origin), null);
  }
});

test('settings preserve bounded preparation times and safe hero URLs', () => {
  for (const value of [0, -1, 241, 2.5, '30']) assert.throws(() => applyAdminSettingsPatch({ defaultPreparationTime: value }, {}));
  const patch = {};
  applyAdminSettingsPatch({ defaultPreparationTime: 30, heroImageDesktop: '/api/media/hero/desktop-123.jpg' }, patch);
  assert.deepEqual(patch, { default_preparation_time_minutes: 30, hero_image_desktop_url: '/api/media/hero/desktop-123.jpg' });
  assert.throws(() => applyAdminSettingsPatch({ heroImageDesktop: 'https://evil.test/tracker.jpg' }, {}));
});
