import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditOutcomeForHttpStatus,
  authenticatedRequestAuditEvent,
  hashAuditSubject,
} from './securityAudit.js';

test('builds bounded audit metadata from route templates without request bodies', () => {
  assert.deepEqual(
    authenticatedRequestAuditEvent({
      adminId: 'admin-1',
      method: 'patch',
      baseUrl: '/api/orders',
      routePath: '/admin/:id/status',
      resourceId: 'order-1',
    }),
    {
      actorAdminId: 'admin-1',
      action: 'admin_api_access',
      httpMethod: 'PATCH',
      routeTemplate: '/api/orders/admin/:id/status',
      resourceType: 'order',
      resourceId: 'order-1',
      outcome: 'attempted',
    }
  );
});

test('hashes normalized login subjects without retaining the email', () => {
  process.env.JWT_SECRET = 'audit-test-secret-with-at-least-thirty-two-bytes';
  const first = hashAuditSubject(' Admin@Example.Test ');
  const second = hashAuditSubject('admin@example.test');
  assert.equal(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(first, /admin|example/i);
});

test('classifies completed admin request outcomes without exposing response bodies', () => {
  assert.equal(auditOutcomeForHttpStatus(204), 'succeeded');
  assert.equal(auditOutcomeForHttpStatus(302), 'succeeded');
  assert.equal(auditOutcomeForHttpStatus(401), 'denied');
  assert.equal(auditOutcomeForHttpStatus(403), 'denied');
  assert.equal(auditOutcomeForHttpStatus(404), 'failed');
  assert.equal(auditOutcomeForHttpStatus(503), 'failed');

  const event = authenticatedRequestAuditEvent(
    {
      adminId: 'admin-1',
      method: 'delete',
      baseUrl: '/api/orders',
      routePath: '/admin/:id',
      resourceId: 'order-1',
    },
    'succeeded'
  );
  assert.equal(event.outcome, 'succeeded');
  assert.equal(Object.hasOwn(event, 'responseBody'), false);
});
