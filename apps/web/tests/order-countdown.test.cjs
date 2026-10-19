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

test('countdown rolls seconds into minutes, hours and days in both directions', () => {
  for (const [seconds, text] of [
    [1, '1 S'],
    [59, '59 S'],
    [60, '1 M 0 S'],
    [61, '1 M 1 S'],
    [3599, '59 M 59 S'],
    [3600, '1 H 0 M 0 S'],
    [3601, '1 H 0 M 1 S'],
    [86399, '23 H 59 M 59 S'],
    [86400, '1 dygn 0 H 0 M 0 S'],
    [90061, '1 dygn 1 H 1 M 1 S'],
    [172800, '2 dygn 0 H 0 M 0 S'],
  ]) {
    for (const sign of [1, -1]) {
      const result = countdown(sign * seconds * 1000);
      assert.equal(result.text, `${sign < 0 ? '-' : ''}${text}`);
      assert.equal(result.isOverdue, sign < 0);
    }
  }
});

test('the overdue times in the reported screenshot show days instead of thousands of minutes', () => {
  assert.equal(countdown(-(2936 * 60 + 2) * 1000).text, '-2 dygn 0 H 56 M 2 S');
  assert.equal(countdown(-(1460 * 60 + 51) * 1000).text, '-1 dygn 0 H 20 M 51 S');
});

test('zero and sub-second boundaries keep the text and overdue state consistent', () => {
  for (const [offset, text, isOverdue] of [
    [1001, '1 S', false], [999, '0 S', false], [0, '0 S', false],
    [-1, '-0 S', true], [-999, '-0 S', true], [-1000, '-1 S', true],
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
  ]) assert.equal(getOrderCountdown(timestamp, now).text, '1 H 5 M 9 S');

  assert.equal(getOrderCountdown('2026-10-25T02:30:00+01:00',
    Date.parse('2026-10-25T02:30:00+02:00')).text, '1 H 0 M 0 S');
});
