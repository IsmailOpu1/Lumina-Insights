import { format, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

// Shape returned by the business_snapshot() database function — the same
// numbers the AI edge functions use.
export interface BusinessSnapshot {
  period: { from: string | null; to: string };
  business: { name: string | null; type: string | null; description: string | null; currency: string };
  revenue: number;
  net_profit: number;
  margin_pct: number;
  orders: number;
  cancelled_orders: number;
  expenses: number;
  ad_spend: number;
  roas: number | null;
  top_products: { name: string; units: number; revenue: number; profit: number }[];
  sales_by_channel: { channel: string; orders: number; revenue: number }[];
  low_stock: { name: string; stock: number; threshold: number }[];
  inventory: { products: number; value: number };
  daily: { date: string; orders: number; revenue: number; profit: number }[];
}

/** Snapshot of the last `days` days (including today) for the caller's workspace. */
export async function fetchRecentSnapshot(days: number): Promise<BusinessSnapshot | null> {
  const { data, error } = await supabase.rpc('business_snapshot', {
    p_from: format(subDays(new Date(), days - 1), 'yyyy-MM-dd'),
  });
  if (error) {
    console.error('business_snapshot failed:', error.message);
    return null;
  }
  return data as unknown as BusinessSnapshot;
}
