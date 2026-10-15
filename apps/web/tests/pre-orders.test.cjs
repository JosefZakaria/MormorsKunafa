const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function load(filename, globals = {}) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, Date, ...globals,
    require: name => load(name.startsWith('@shared/')
      ? path.resolve(__dirname, '../../..', 'shared', name.slice('@shared/'.length) + '.ts')
      : path.resolve(path.dirname(filename), name.replace(/\.js$/, '.ts')), globals),
  }, { filename });
  return exports;
}
const { isPreOrder, getOrderIncomingAt, calculateOrderReadyTime } = load(path.resolve(__dirname, '../../../shared/utils/scheduledTime.ts'));

test('same-day pickup stays pre-ordered until exactly 20 minutes remain', () => {
  const pickup = '2026-10-15T18:00:00+02:00';
  for (const [now, expected] of [
    ['2026-10-15T16:00:00+02:00', true],
    ['2026-10-15T17:39:59.999+02:00', true],
    ['2026-10-15T17:40:00+02:00', false],
    ['2026-10-15T17:40:00.001+02:00', false],
    ['2026-10-15T18:30:00+02:00', false],
  ]) assert.equal(isPreOrder(pickup, new Date(now)), expected, now);
  for (const value of [undefined, null, '', 'invalid']) {
    assert.equal(isPreOrder(value), false);
    assert.equal(getOrderIncomingAt(value), null);
  }
});

test('date changes, UTC values and daylight saving offsets use elapsed time', () => {
  assert.equal(isPreOrder('2026-10-16T00:10:00+02:00', new Date('2026-10-15T23:49:59+02:00')), true);
  assert.equal(isPreOrder('2026-10-16T00:10:00+02:00', new Date('2026-10-15T23:50:00+02:00')), false);
  assert.equal(isPreOrder('2026-10-16T18:00:00+02:00', new Date('2026-10-16T00:00:00+02:00')), true);
  assert.equal(isPreOrder('2026-10-25T02:10:00+01:00', new Date('2026-10-25T02:50:00+02:00')), false);
  for (const timestamp of ['2026-10-15T16:00:00Z', '2026-10-15T16:00:00', '2026-10-15 16:00:00']) {
    assert.equal(getOrderIncomingAt(timestamp), Date.parse('2026-10-15T15:40:00Z'));
  }
});

test('creation and acceptance preserve scheduled pickup, including explicit adjustments and late acceptance', () => {
  const pickup = '2026-10-15T18:00:00+02:00';
  for (const now of ['2026-10-15T16:00:00+02:00', '2026-10-15T17:40:00+02:00', '2026-10-15T18:30:00+02:00']) {
    assert.equal(calculateOrderReadyTime(pickup, 30, 0, new Date(now)).toISOString(), '2026-10-15T16:00:00.000Z');
    assert.equal(calculateOrderReadyTime(pickup, 30, 10, new Date(now)).toISOString(), '2026-10-15T16:10:00.000Z');
  }
  const now = new Date('2026-10-15T16:00:00Z');
  assert.equal(calculateOrderReadyTime(undefined, 30, 10, now).toISOString(), '2026-10-15T16:40:00.000Z');
  assert.equal(calculateOrderReadyTime(undefined, 30, -5, now).toISOString(), '2026-10-15T16:25:00.000Z');
});

test('release timer refreshes at the earliest boundary, cancels cleanly and handles distant bookings', () => {
  let now = Date.parse('2026-10-15T14:00:00Z');
  let callback, delay, cancelled = false, calls = 0;
  const { scheduleOrderRelease } = load(path.resolve(__dirname, '../src/utils/scheduleOrderRelease.ts'), {
    Date: class extends Date { static now() { return now; } },
    setTimeout: (fn, ms) => { callback = fn; delay = ms; return 1; },
    clearTimeout: () => { cancelled = true; },
  });
  const stop = scheduleOrderRelease(['invalid', undefined, '2026-10-15T17:00:00Z', '2026-10-15T15:00:00Z'], () => { calls += 1; });
  assert.equal(delay, 40 * 60_000);
  now += delay - 1;
  callback();
  assert.equal(calls, 0, 'a timer that fires early must rearm');
  assert.equal(delay, 1);
  now += 1;
  callback();
  assert.equal(calls, 1);
  stop();
  assert.equal(cancelled, true);
  callback = undefined;
  scheduleOrderRelease(['2026-10-15T14:00:00Z'], assert.fail);
  assert.equal(callback, undefined, 'overdue entries are left to normal polling');
  scheduleOrderRelease(['2026-12-15T14:00:00Z'], () => { calls += 1; });
  assert.equal(delay, 2_147_483_647);
  now += delay;
  callback();
  assert.equal(calls, 1, 'distant orders must not release when a capped timer fires');
  assert.ok(delay > 0);
});
