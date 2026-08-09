import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePublicHttpsAssetUrl,
  normalizePublicWebAppOrigin,
} from './publicWebAppUrl.js';

test('accepts only clean production HTTPS origins', () => {
  assert.equal(normalizePublicWebAppOrigin(' https://mormorskunafa.se/ ', true), 'https://mormorskunafa.se');
  assert.equal(normalizePublicWebAppOrigin('http://mormorskunafa.se', true), null);
  assert.equal(normalizePublicWebAppOrigin('https://user:secret@example.se', true), null);
  assert.equal(normalizePublicWebAppOrigin('https://example.se/path', true), null);
  assert.equal(normalizePublicWebAppOrigin('javascript:alert(1)', true), null);
  assert.equal(normalizePublicWebAppOrigin('http://localhost:5173', false), 'http://localhost:5173');
});

test('accepts only public HTTPS asset URLs', () => {
  assert.equal(
    normalizePublicHttpsAssetUrl('https://cdn.example.se/logo.png?v=2'),
    'https://cdn.example.se/logo.png?v=2'
  );
  assert.equal(normalizePublicHttpsAssetUrl('http://cdn.example.se/logo.png'), null);
  assert.equal(normalizePublicHttpsAssetUrl('https://user:secret@cdn.example.se/logo.png'), null);
});
