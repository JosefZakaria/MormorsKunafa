import assert from 'node:assert/strict';
import test from 'node:test';
import { pushWorkerHarness } from './lib/push-worker-harness.mjs';

test('worker uses only current same-origin authorization and generic content, including legacy payloads', async () => {
  let finish;
  const response = new Promise(resolve => { finish = resolve; });
  const worker = await pushWorkerHarness(async (url, options) => {
    assert.equal(url, '/api/admin/notifications/pending');
    assert.deepEqual(JSON.parse(JSON.stringify(options)), {
      method: 'GET', credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'error',
    });
    return response;
  });
  const pending = worker.push({ type: 'order_wakeup', title: 'SECRET', body: 'SECRET', order_id: 'SECRET',
    order_number: 'SECRET', created_at: 'SECRET', tag: 'SECRET', url: 'https://untrusted.invalid/SECRET' });
  assert.equal(worker.notifications.length, 0, 'No OS notification before authorization resolves');
  finish(Response.json({ shouldNotify: true }));
  await pending;
  assert.equal(worker.notifications.length, 1);
  assert.equal(worker.notifications[0].title, 'Ny order');
  assert.equal(worker.notifications[0].body, 'Det finns beställningar att ta emot');
  assert.deepEqual(worker.notifications[0].data, { url: '/admin/dashboard' });
  assert(!JSON.stringify(worker.notifications).includes('SECRET'));
  await worker.click({ url: '/admin/dashboard?orderId=SECRET', orderId: 'SECRET' });
  assert.deepEqual(worker.navigations, ['/admin/dashboard']);
});

for (const [name, fetch] of [
  ['wrong store or empty queue', async () => Response.json({ shouldNotify: false })],
  ['logged out', async () => Response.json({ shouldNotify: true }, { status: 401 })],
  ['forbidden', async () => Response.json({ shouldNotify: true }, { status: 403 })],
  ['server failure', async () => Response.json({ shouldNotify: true }, { status: 503 })],
  ['network failure', async () => { throw new Error('offline'); }],
  ['invalid JSON', async () => new Response('<html>login</html>')],
  ['null response', async () => Response.json(null)],
  ['truthy nonboolean', async () => Response.json({ shouldNotify: 'true' })],
  ['missing decision', async () => Response.json({})],
]) test(`worker suppresses notification: ${name}`, async () => {
  const worker = await pushWorkerHarness(fetch);
  await worker.push({ title: 'SECRET', order_id: 'SECRET' });
  assert.equal(worker.notifications.length, 0);
});

test('worker rechecks on every wakeup and suppresses after logout or queue acknowledgement', async () => {
  let allowed = true, calls = 0;
  const worker = await pushWorkerHarness(async () => { calls++; return Response.json({ shouldNotify: allowed }); });
  await worker.push();
  allowed = false;
  await worker.push();
  assert.equal(calls, 2);
  assert.equal(worker.notifications.length, 1);
});
