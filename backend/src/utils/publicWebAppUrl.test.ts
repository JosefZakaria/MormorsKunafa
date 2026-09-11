import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPublicUrlConfiguration,
  getAllowedFrontendOrigins,
  getPublicWebAppUrl,
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
  assert.equal(normalizePublicWebAppOrigin('https://mormorskunafa.se.', true), null);
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
      VERCEL_ENV: undefined,
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
      VERCEL_ENV: undefined,
      PUBLIC_WEB_APP_URL: 'https://example.se',
      FRONTEND_URL: 'https://example.se',
      FRONTEND_URLS: 'https://preview.example.se, https://preview-two.example.se',
      SITE_PUBLIC_URL: 'https://example.se',
      ORDER_EMAIL_LOGO_URL: 'https://cdn.example.se/logo.png?v=2',
    },
    () => assert.doesNotThrow(assertPublicUrlConfiguration)
  );
});

const previewEnvironment = {
  NODE_ENV: 'production',
  VERCEL_ENV: 'preview',
  PUBLIC_WEB_APP_URL: 'https://web-preview.example.test',
  FRONTEND_URL: undefined,
  FRONTEND_URLS: undefined,
  SITE_PUBLIC_URL: undefined,
  PRODUCTION_WEB_ORIGINS: undefined,
  ORDER_EMAIL_LOGO_URL: undefined,
};

test('Preview has an explicit payment return and CORS excludes Production defaults', () => {
  withEnvironment(previewEnvironment, () => {
    assert.doesNotThrow(assertPublicUrlConfiguration);
    assert.equal(getPublicWebAppUrl(), 'https://web-preview.example.test');
    assert.deepEqual(getAllowedFrontendOrigins(), ['https://web-preview.example.test']);
  });
});

test('Preview refuses missing explicit return URL instead of using the Production fallback', () => {
  withEnvironment({ ...previewEnvironment, PUBLIC_WEB_APP_URL: undefined, FRONTEND_URL: 'https://web-preview.example.test' }, () => {
    assert.throws(assertPublicUrlConfiguration, /Preview requires/);
    assert.throws(getPublicWebAppUrl, /Preview requires/);
    assert.throws(getAllowedFrontendOrigins, /Preview requires/);
  });
});

test('Preview refuses Production references in return, email and CORS configuration', () => {
  for (const key of ['PUBLIC_WEB_APP_URL', 'FRONTEND_URL', 'FRONTEND_URLS', 'SITE_PUBLIC_URL']) {
    for (const origin of ['https://mormorskunafa.se', 'https://www.mormorskunafa.se', 'https://old-production.example.test']) {
      withEnvironment({ ...previewEnvironment, [key]: origin, PRODUCTION_WEB_ORIGINS: 'https://old-production.example.test' }, () => {
        assert.throws(assertPublicUrlConfiguration, /must not target a known Production/);
        assert.throws(getAllowedFrontendOrigins, /must not target a known Production/);
      });
    }
  }
});

test('Production retains its approved web defaults and configured CORS origins', () => {
  withEnvironment({ ...previewEnvironment, VERCEL_ENV: 'production', PUBLIC_WEB_APP_URL: 'https://mormorskunafa.se', FRONTEND_URLS: 'https://extra.example.test' }, () => {
    assert.equal(getPublicWebAppUrl(), 'https://mormorskunafa.se');
    assert.deepEqual(getAllowedFrontendOrigins(), ['https://mormorskunafa.se', 'https://www.mormorskunafa.se', 'https://extra.example.test']);
  });
});
