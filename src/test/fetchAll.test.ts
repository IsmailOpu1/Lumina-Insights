import { describe, it, expect, vi } from 'vitest';
import { PostgrestError } from '@supabase/supabase-js';
import { fetchAll, PAGE_ROWS } from '@/lib/fetchAll';

// A table of `total` rows served the way Supabase does: at most 1,000 a request.
function table(total: number) {
  return vi.fn(async (from: number, to: number) => {
    const rows = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({ id: from + i }));
    return { data: rows, error: null };
  });
}

describe('fetchAll', () => {
  it('keeps going past 1,000 rows', async () => {
    const page = table(2500);
    const { data } = await fetchAll(page);
    expect(data).toHaveLength(2500);
    expect(data?.[2499]).toEqual({ id: 2499 });
    expect(page).toHaveBeenCalledTimes(3);
    expect(page).toHaveBeenNthCalledWith(2, PAGE_ROWS, 2 * PAGE_ROWS - 1);
  });

  it('asks once more when the last page is exactly full', async () => {
    const page = table(1000);
    const { data } = await fetchAll(page);
    expect(data).toHaveLength(1000);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it('passes errors through', async () => {
    const error = new PostgrestError({ message: 'boom', details: '', hint: '', code: '500' });
    const { data, error: got } = await fetchAll(async () => ({ data: null, error }));
    expect(data).toBeNull();
    expect(got).toBe(error);
  });
});
