import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase.js';

export { supabase };
export type Row = Record<string, unknown>;

export function generateId(): string {
  return crypto.randomUUID();
}

export function logSupabaseError(context: string, error: PostgrestError | null | undefined): void {
  if (!error) return;
  console.error(`[${context}] Supabase error:`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}
