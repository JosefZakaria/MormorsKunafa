import { createHmac, randomUUID } from 'node:crypto';
import { logSupabaseError, supabase } from '../db/connection.js';

export type SecurityAuditEvent = {
  actorAdminId?: string;
  subjectHash?: string;
  action: string;
  httpMethod?: string;
  routeTemplate?: string;
  resourceType?: string;
  resourceId?: string;
  outcome: 'attempted' | 'succeeded' | 'denied' | 'failed';
};

export type SecurityAuditOutcome = SecurityAuditEvent['outcome'];

function bounded(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function hashAuditSubject(subject: string): string {
  const secret = process.env.JWT_SECRET?.trim() ?? '';
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET is not configured for audit subject hashing');
  }
  return createHmac('sha256', secret)
    .update(subject.trim().toLowerCase())
    .digest('base64url');
}

export function authenticatedRequestAuditEvent(input: {
  adminId: string;
  method: string;
  baseUrl?: string;
  routePath?: unknown;
  resourceId?: unknown;
}, outcome: SecurityAuditOutcome = 'attempted'): SecurityAuditEvent {
  const baseUrl = bounded(input.baseUrl, 128);
  const routePath = bounded(input.routePath, 127);
  const routeTemplate = `${baseUrl}${routePath}`.slice(0, 255);
  const resourceType = baseUrl.includes('/orders')
    ? 'order'
    : baseUrl.includes('/products')
      ? 'product'
      : 'admin';
  return {
    actorAdminId: bounded(input.adminId, 128),
    action: 'admin_api_access',
    httpMethod: bounded(input.method, 10).toUpperCase(),
    routeTemplate,
    resourceType,
    resourceId: bounded(input.resourceId, 128),
    outcome,
  };
}

export function auditOutcomeForHttpStatus(statusCode: number): Exclude<SecurityAuditOutcome, 'attempted'> {
  if (statusCode === 401 || statusCode === 403) return 'denied';
  if (statusCode >= 200 && statusCode < 400) return 'succeeded';
  return 'failed';
}

export async function recordSecurityAuditEvent(event: SecurityAuditEvent): Promise<void> {
  const { error } = await supabase.rpc('append_security_audit_event', {
    p_event_id: randomUUID(),
    p_actor_admin_id: bounded(event.actorAdminId, 128),
    p_subject_hash: bounded(event.subjectHash, 43),
    p_action: bounded(event.action, 100),
    p_http_method: bounded(event.httpMethod, 10),
    p_route_template: bounded(event.routeTemplate, 255),
    p_resource_type: bounded(event.resourceType, 64),
    p_resource_id: bounded(event.resourceId, 128),
    p_outcome: event.outcome,
  });
  if (error) {
    logSupabaseError('recordSecurityAuditEvent', error);
    throw error;
  }
}
