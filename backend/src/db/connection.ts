import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase.js';
import { safeErrorMetadata } from '../utils/safeErrorMetadata.js';

export { supabase };
export type Row = Record<string, unknown>;

export function generateId(): string {
  return crypto.randomUUID();
}

export function logSupabaseError(context: string, error: PostgrestError | null | undefined): void {
  if (!error) return;
  // PostgREST details can include the rejected column value (including PII).
  console.error(`[${context}] Supabase error:`, safeErrorMetadata(error));
}

export function nowIso(): string {
  return new Date().toISOString();
}
