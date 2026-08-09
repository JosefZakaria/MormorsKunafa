import assert from 'node:assert/strict';
import test from 'node:test';
import { getSinchConversationApiBaseUrl } from './SmsService.js';

test('uses the Sinch EU region by default', () => {
  assert.equal(getSinchConversationApiBaseUrl(), 'https://eu.conversation.api.sinch.com');
  assert.equal(getSinchConversationApiBaseUrl(' EU '), 'https://eu.conversation.api.sinch.com');
});

test('allows only documented Sinch regional hosts', () => {
  assert.equal(getSinchConversationApiBaseUrl('us'), 'https://us.conversation.api.sinch.com');
  assert.equal(getSinchConversationApiBaseUrl('br'), 'https://br.conversation.api.sinch.com');
  assert.throws(() => getSinchConversationApiBaseUrl('https://attacker.example'));
  assert.throws(() => getSinchConversationApiBaseUrl('custom'));
});
