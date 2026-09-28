import { supabase, logSupabaseError, type Row } from './connection.js';

/** A short page is not EOF: hosted PostgREST may impose a smaller row cap. */
export async function collectRowsById<T extends { id: unknown }>(
  fetchPage: (after: string | undefined) => PromiseLike<T[]>,
  limits = { maxPages: 1000, maxRows: 100_000 }
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < limits.maxPages; page++) {
    const batch = await fetchPage(after);
    if (!batch.length) return rows;
    for (const row of batch) {
      if (typeof row.id !== 'string' || !row.id || (after !== undefined && row.id <= after)) {
        throw new Error('Database pagination did not advance');
      }
      after = row.id;
      rows.push(row);
      if (rows.length > limits.maxRows) throw new Error('Database report exceeds its row limit');
    }
  }
  throw new Error('Database report exceeds its page limit');
}

// Callers must include the table's own id. Fetch solely in that order, then
// restore presentation sorting. These reads are not a transaction snapshot.
export async function readAllRows(table: 'products' | 'orders' | 'order_items', columns: string): Promise<Row[]> {
  return collectRowsById(async after => {
    let query = supabase.from(table).select(columns).order('id', { ascending:true }).limit(500);
    if (after !== undefined) query = query.gt('id', after);
    const { data, error } = await query;
    if (error) {
      logSupabaseError(`readAllRows ${table}`, error);
      throw new Error('Could not read the complete database report');
    }
    if (!Array.isArray(data)) throw new Error('Invalid database report page');
    return data as unknown as (Row & { id:unknown })[];
  });
}
