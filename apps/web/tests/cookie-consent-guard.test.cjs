// Guards the cookie-consent rule: customer pages must not touch the visitor's browser
// storage or load third-party embeds except through src/consent and ConsentMap.
const assert = require('node:assert/strict');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');

/** Files allowed to use browser storage directly: the consent module and staff-only code. */
const STORAGE_ALLOWED = [
  'src/consent/',
  'src/pages/Admin/',
  'src/contexts/AuthContext.tsx', // reads only on admin pages
  'src/services/api.ts', // reads the staff token only on admin pages
  'src/services/printer.ts', // admin dashboard only
  'src/services/pwa.ts', // registers only on admin pages
  'src/hooks/useOrderAlarm.ts', // admin dashboard only
];

const IFRAME_ALLOWED = ['src/components/common/ConsentMap/'];

const STORAGE_PATTERN = /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie|navigator\.serviceWorker/;
const IFRAME_PATTERN = /<iframe\b/i;

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function offenders(pattern, allowed) {
  const found = [];
  for (const file of sourceFiles(src)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (allowed.some((prefix) => rel.startsWith(prefix))) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (pattern.test(line)) found.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
  }
  return found;
}

test('customer code reaches browser storage only through consentStorage', () => {
  assert.deepEqual(
    offenders(STORAGE_PATTERN, STORAGE_ALLOWED),
    [],
    'Use consentStorage from src/consent/consent.ts instead of browser storage on customer pages.',
  );
});

test('third-party embeds go through ConsentMap', () => {
  assert.deepEqual(
    offenders(IFRAME_PATTERN, IFRAME_ALLOWED),
    [],
    'Embedded third-party content must wait for consent (see ConsentMap).',
  );
});

test('index.html loads no external scripts, styles or frames', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<(script|link|iframe|img)\b[^>]*(src|href)=["']https?:\/\//i);
});
