import { supabase } from '@/integrations/supabase/client';
import type { Entity } from './fields';

export interface ImportCounts {
  import_id?: string;
  products_created: number;
  products_updated: number;
  orders_created: number;
  orders_skipped: number;
  expenses_created: number;
  expenses_skipped: number;
}

export interface ImportRecord {
  id: string;
  file_name: string;
  counts: Partial<ImportCounts>;
  created_at: string;
  undone_at: string | null;
}

const MESSAGES: Record<string, string> = {
  plan_limit_orders:
    "This file has more orders from this month than your plan allows. Older orders don't count, so you can import last months' history now, or upgrade to Pro for unlimited orders.",
  subscription_inactive: 'Your plan has expired. Choose a plan on the Billing page to import data.',
  import_not_allowed: 'Only the owner and managers can import data.',
  import_too_large: 'That file is too large. Please import up to 5,000 rows of each kind at a time.',
  import_not_found: 'That import no longer exists.',
  import_already_undone: 'That import was already undone.',
};

function friendly(message: string) {
  const code = Object.keys(MESSAGES).find((c) => message.includes(c));
  if (code) return MESSAGES[code];
  if (/invalid input syntax|violates check constraint|out of range/i.test(message)) {
    return 'Some values in the file could not be saved. Please check the highlighted rows and try again.';
  }
  return 'The import did not finish, and nothing was saved. Please try again.';
}

/** All or nothing: on any error the database keeps nothing from the file. */
export async function runImport(fileName: string, records: Record<Entity, Record<string, unknown>[]>): Promise<ImportCounts> {
  const { data, error } = await supabase.rpc('import_business_data' as never, {
    p_file_name: fileName,
    p_inventory: records.inventory,
    p_orders: records.orders,
    p_expenses: records.expenses,
  } as never);
  if (error) throw new Error(friendly(error.message));
  return data as unknown as ImportCounts;
}

export async function undoImport(id: string) {
  const { error } = await supabase.rpc('undo_import' as never, { p_import_id: id } as never);
  if (error) throw new Error(friendly(error.message));
}

export async function listImports(): Promise<ImportRecord[]> {
  const { data, error } = await supabase
    .from('imports' as never)
    .select('id, file_name, counts, created_at, undone_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as unknown as ImportRecord[];
}
