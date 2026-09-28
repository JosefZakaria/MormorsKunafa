import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canTransitionOrderStatus,
  canUseGeneralStatusRoute,
  isOrderStatus,
} from './orderStateMachine.js';

test('allows only forward lifecycle transitions', () => {
  assert.equal(canTransitionOrderStatus('ny', 'mottagen'), true);
  assert.equal(canTransitionOrderStatus('mottagen', 'påbörjad'), true);
  assert.equal(canTransitionOrderStatus('mottagen', 'klar'), true);
  assert.equal(canTransitionOrderStatus('påbörjad', 'klar'), true);
  assert.equal(canTransitionOrderStatus('klar', 'uthämtad'), true);
  assert.equal(canTransitionOrderStatus('klar', 'levererad'), true);

  assert.equal(canTransitionOrderStatus('klar', 'mottagen'), false);
  assert.equal(canTransitionOrderStatus('avbruten', 'mottagen'), false);
  assert.equal(canTransitionOrderStatus('levererad', 'klar'), false);
  assert.equal(canTransitionOrderStatus('ny', 'klar'), false);
});

test('reserves acceptance and cancellation for their guarded routes', () => {
  assert.equal(canUseGeneralStatusRoute('mottagen'), false);
  assert.equal(canUseGeneralStatusRoute('avbruten'), false);
  assert.equal(canUseGeneralStatusRoute('klar'), true);
});

test('rejects unknown database or request status values', () => {
  assert.equal(isOrderStatus('mottagen'), true);
  assert.equal(isOrderStatus('refunded'), false);
  assert.equal(isOrderStatus(null), false);
});
