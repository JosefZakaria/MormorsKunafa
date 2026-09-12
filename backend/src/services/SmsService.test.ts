import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifySinchHttpFailure,
  getSinchConversationApiBaseUrl,
  sendSms,
} from './SmsService.js';
import { OutboundDeliveryError } from './outboundDeliveryError.js';

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

test('classifies retryable, uncertain and permanent Sinch responses conservatively', () => {
  assert.equal(classifySinchHttpFailure(429).disposition, 'retryable');
  assert.equal(classifySinchHttpFailure(503).disposition, 'uncertain');
  assert.equal(classifySinchHttpFailure(400).disposition, 'permanent');
});

test('treats a lost Sinch response as uncertain and never exposes the raw error', async () => {
  const previousFetch = globalThis.fetch;
  const previous = {
    project: process.env.SINCH_PROJECT_ID,
    keyId: process.env.SINCH_KEY_ID,
    keySecret: process.env.SINCH_KEY_SECRET,
    app: process.env.SINCH_APP_ID,
  };
  process.env.SINCH_PROJECT_ID = 'project';
  process.env.SINCH_KEY_ID = 'key';
  process.env.SINCH_KEY_SECRET = 'secret';
  process.env.SINCH_APP_ID = 'app';
  globalThis.fetch = async () => { throw new Error('contains customer@example.test'); };
  try {
    await assert.rejects(sendSms('+46700000000', 'synthetic'), (error: unknown) => {
      assert(error instanceof OutboundDeliveryError);
      assert.equal(error.disposition, 'uncertain');
      assert.equal(error.code, 'provider_response_uncertain');
      assert(!error.message.includes('customer@example.test'));
      return true;
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previous.project === undefined) delete process.env.SINCH_PROJECT_ID;
    else process.env.SINCH_PROJECT_ID = previous.project;
    if (previous.keyId === undefined) delete process.env.SINCH_KEY_ID;
    else process.env.SINCH_KEY_ID = previous.keyId;
    if (previous.keySecret === undefined) delete process.env.SINCH_KEY_SECRET;
    else process.env.SINCH_KEY_SECRET = previous.keySecret;
    if (previous.app === undefined) delete process.env.SINCH_APP_ID;
    else process.env.SINCH_APP_ID = previous.app;
  }
});
