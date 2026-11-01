import type { PostgrestError } from '@supabase/supabase-js';

/** Supabase returns at most this many rows per request. */
export const PAGE_ROWS = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

/**
 * Every row of a query, fetched a page at a time. A single request stops
 * silently at 1,000 rows, which hid older orders once a shop imported its
 * history. `page(from, to)` must add `.range(from, to)` to a query with a
 * stable order (end with a unique column such as `id`).
 */
export async function fetchAll<T>(page: (from: number, to: number) => Page<T>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_ROWS) return { data: rows, error: null };
  }
}
