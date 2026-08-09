import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveProductImage } from './productImage.js';

const FALLBACK = '/images/walnut-baklawa-plated.jpg';

test('maps known legacy WordPress assets to local static images', () => {
  assert.equal(
    resolveProductImage('unknown', 'https://old.example/wp-content/uploads/2024/3.png'),
    '/images/ashta-baklawa.jpg'
  );
});

test('accepts only local or trusted-site static image paths', () => {
  assert.equal(resolveProductImage('unknown', '/images/custom-product.webp'), '/images/custom-product.webp');
  assert.equal(
    resolveProductImage('unknown', 'https://www.mormorskunafa.se/images/custom-product.jpg'),
    '/images/custom-product.jpg'
  );
  assert.equal(resolveProductImage('unknown', 'https://images.example/custom.jpg'), FALLBACK);
  assert.equal(resolveProductImage('unknown', 'http://mormorskunafa.se/images/custom.jpg'), FALLBACK);
});

test('rejects protocol-relative, executable and traversing image values', () => {
  assert.equal(resolveProductImage('unknown', '//images.example/custom.jpg'), FALLBACK);
  assert.equal(resolveProductImage('unknown', 'data:image/svg+xml,<svg/>'), FALLBACK);
  assert.equal(resolveProductImage('unknown', '/images/../private/secret.jpg'), FALLBACK);
  assert.equal(resolveProductImage('unknown', '/images/%2e%2e/private/secret.jpg'), FALLBACK);
  assert.equal(resolveProductImage('unknown', '/images/custom.svg'), FALLBACK);
});
