const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/utils/orderQueueRefresh.ts');
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports }, { filename });
const { createOrderQueueRefresh } = moduleExports;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('new pending orders apply without waiting for a stalled or failed secondary list', async () => {
  const stalled = deferred();
  const applied = [];
  const errors = [];
  const pending = createOrderQueueRefresh(async () => ['new-paid-order'], value => applied.push(value), error => errors.push(error));
  const active = createOrderQueueRefresh(() => stalled.promise, () => assert.fail('still pending'), error => errors.push(error));
  const preOrders = createOrderQueueRefresh(async () => { throw new Error('pre-orders unavailable'); }, () => assert.fail(), error => errors.push(error));
  const slow = active.refresh();
  const failed = preOrders.refresh();
  await pending.refresh();
  await failed;
  assert.deepEqual(applied, [['new-paid-order']]);
  assert.equal(errors.length, 1);
  active.dispose();
  stalled.resolve([]);
  await slow;
});

test('simultaneous wake and SSE refreshes coalesce and fetch again after the in-flight snapshot', async () => {
  const first = deferred();
  const second = deferred();
  const values = [];
  let calls = 0;
  const queue = createOrderQueueRefresh(() => (++calls === 1 ? first.promise : second.promise), value => values.push(value), assert.fail);
  const finished = queue.refresh();
  for (let i = 0; i < 50; i += 1) assert.equal(queue.refresh(true), finished);
  assert.equal(calls, 1);
  first.resolve(['old']);
  await Promise.resolve();
  assert.equal(calls, 2);
  second.resolve(['old', 'new']);
  await finished;
  assert.deepEqual(values, [['old'], ['old', 'new']]);
  assert.equal(calls, 2);
});

test('ordinary polling does not queue duplicate requests during a slow response', async () => {
  const request = deferred();
  let calls = 0;
  const queue = createOrderQueueRefresh(() => { calls += 1; return request.promise; }, () => {}, assert.fail);
  const finished = queue.refresh();
  for (let i = 0; i < 50; i += 1) queue.refresh();
  request.resolve([]);
  await finished;
  assert.equal(calls, 1);
});

test('failed refresh preserves the last paid order and a later recovery can clear it', async () => {
  let response = ['paid-order'];
  let shouldFail = false;
  let current = [];
  const errors = [];
  const queue = createOrderQueueRefresh(async () => {
    if (shouldFail) throw new Error('offline');
    return response;
  }, orders => { current = orders; }, error => errors.push(error));
  await queue.refresh();
  shouldFail = true;
  await queue.refresh();
  assert.deepEqual(current, ['paid-order']);
  assert.equal(errors.length, 1);
  shouldFail = false;
  response = [];
  await queue.refresh();
  assert.deepEqual(current, []);
});

test('a wake refresh queued during a failure still retries', async () => {
  const request = deferred();
  let calls = 0;
  const received = [];
  const errors = [];
  const queue = createOrderQueueRefresh(() => ++calls === 1 ? request.promise : Promise.resolve(['paid-order']), value => received.push(value), error => errors.push(error));
  const finished = queue.refresh();
  queue.refresh(true);
  request.reject(new Error('temporary network failure'));
  await finished;
  assert.equal(calls, 2);
  assert.equal(errors.length, 1);
  assert.deepEqual(received, [['paid-order']]);
});

test('unmount discards late responses and cancels queued work', async () => {
  const request = deferred();
  let calls = 0;
  const queue = createOrderQueueRefresh(() => { calls += 1; return request.promise; }, () => assert.fail('updated after unmount'), assert.fail);
  const finished = queue.refresh();
  queue.refresh(true);
  queue.dispose();
  request.resolve(['paid-order']);
  await finished;
  await queue.refresh(true);
  assert.equal(calls, 1);
});

test('unmount also ignores a late network failure', async () => {
  const request = deferred();
  const queue = createOrderQueueRefresh(() => request.promise, assert.fail, () => assert.fail('reported after unmount'));
  const finished = queue.refresh();
  queue.dispose();
  request.reject(new Error('offline'));
  await finished;
});
