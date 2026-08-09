import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPublicUrlConfiguration,
  normalizePublicHttpsAssetUrl,
  normalizePublicWebAppOrigin,
} from './publicWebAppUrl.js';

function withEnvironment(values: Record<string, string | undefined>, action: () => void): void {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    action();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

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

test('production startup rejects malformed public URL configuration', () => {
  withEnvironment(
    {
      NODE_ENV: 'production',
      VERCEL: undefined,
      PUBLIC_WEB_APP_URL: 'https://example.se/checkout',
      FRONTEND_URL: undefined,
      FRONTEND_URLS: undefined,
      SITE_PUBLIC_URL: undefined,
      ORDER_EMAIL_LOGO_URL: undefined,
    },
    () => assert.throws(assertPublicUrlConfiguration, /PUBLIC_WEB_APP_URL/)
  );

  withEnvironment(
    {
      NODE_ENV: 'production',
      VERCEL: undefined,
      PUBLIC_WEB_APP_URL: 'https://example.se',
      FRONTEND_URL: 'https://example.se',
      FRONTEND_URLS: 'https://preview.example.se, https://preview-two.example.se',
      SITE_PUBLIC_URL: 'https://example.se',
      ORDER_EMAIL_LOGO_URL: 'https://cdn.example.se/logo.png?v=2',
    },
    () => assert.doesNotThrow(assertPublicUrlConfiguration)
  );
});
