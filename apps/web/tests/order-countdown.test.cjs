const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function load(filename) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Date,
    require: name => load(path.resolve(__dirname, '../../../shared', name.slice('@shared/'.length) + '.ts')),
  }, { filename });
  return exports;
}

const { getOrderCountdown } = load(path.resolve(__dirname, '../src/utils/orderCountdown.ts'));
const now = Date.parse('2026-10-19T12:00:00Z');
const countdown = offset => getOrderCountdown(new Date(now + offset).toISOString(), now);

test('the reported 16 minutes and 36 seconds use unambiguous Swedish units', () => {
  assert.equal(countdown((16 * 60 + 36) * 1000).text, '16 min 36 sek');
});

test('countdown rolls seconds into minutes, hours and days in both directions', () => {
  for (const [seconds, text] of [
    [1, '1 sek'],
    [59, '59 sek'],
    [60, '1 min 0 sek'],
    [61, '1 min 1 sek'],
    [3599, '59 min 59 sek'],
    [3600, '1 tim 0 min 0 sek'],
    [3601, '1 tim 0 min 1 sek'],
    [86399, '23 tim 59 min 59 sek'],
    [86400, '1 dygn 0 tim 0 min 0 sek'],
    [90061, '1 dygn 1 tim 1 min 1 sek'],
    [172800, '2 dygn 0 tim 0 min 0 sek'],
  ]) {
    for (const sign of [1, -1]) {
      const result = countdown(sign * seconds * 1000);
      assert.equal(result.text, `${sign < 0 ? '-' : ''}${text}`);
      assert.equal(result.isOverdue, sign < 0);
    }
  }
});

test('the overdue times in the reported screenshot show days instead of thousands of minutes', () => {
  assert.equal(countdown(-(2936 * 60 + 2) * 1000).text, '-2 dygn 0 tim 56 min 2 sek');
  assert.equal(countdown(-(1460 * 60 + 51) * 1000).text, '-1 dygn 0 tim 20 min 51 sek');
});

test('zero and sub-second boundaries keep the text and overdue state consistent', () => {
  for (const [offset, text, isOverdue] of [
    [1001, '1 sek', false], [999, '0 sek', false], [0, '0 sek', false],
    [-1, '-0 sek', true], [-999, '-0 sek', true], [-1000, '-1 sek', true],
  ]) {
    const result = countdown(offset);
    assert.equal(result.text, text);
    assert.equal(result.isOverdue, isOverdue);
  }
});

test('missing or invalid ready times never appear overdue', () => {
  for (const input of [undefined, null, '', 'invalid']) {
    const result = getOrderCountdown(input, now);
    assert.equal(result.text, '--');
    assert.equal(result.isOverdue, false);
  }
});

test('API timestamps with UTC, offsets and missing timezone retain the existing interpretation', () => {
  for (const timestamp of [
    '2026-10-19T13:05:09Z', '2026-10-19T15:05:09+02:00',
    '2026-10-19T13:05:09', '2026-10-19 13:05:09',
  ]) assert.equal(getOrderCountdown(timestamp, now).text, '1 tim 5 min 9 sek');

  assert.equal(getOrderCountdown('2026-10-25T02:30:00+01:00',
    Date.parse('2026-10-25T02:30:00+02:00')).text, '1 tim 0 min 0 sek');
});
