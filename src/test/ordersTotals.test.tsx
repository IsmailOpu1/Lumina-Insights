import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { format } from 'date-fns';
import Orders from '@/pages/Orders';

const today = format(new Date(), 'yyyy-MM-dd');
const order = (id: string, quantity: number, selling_price: number, status = 'Delivered') => ({
  id, order_number: id, customer_name: 'Rahim', product_id: null, product_name: 'Panjabi', source: 'Facebook',
  status, quantity, selling_price, unit_cost: 0, shipping_cost: 0, ad_cost: 0, profit_per_order: 0, date: today,
});

vi.mock('@/lib/fetchAll', () => ({
  // Two panjabis at 1,000 and one at 500; the cancelled order doesn't count.
  fetchAll: async () => ({
    data: [order('o1', 2, 1000), order('o2', 1, 500), order('o3', 4, 900, 'Cancelled')],
    error: null,
  }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/context/FABContext', () => ({ useRefreshOnSave: () => {} }));
vi.mock('@/hooks/useReadOnly', () => ({ useReadOnly: () => true }));
vi.mock('@/hooks/useExportGate', () => ({ useExportGate: () => () => true }));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => ({ formatCurrency: (n: number) => `৳${n}`, symbol: '৳' }) }));
vi.mock('@/components/AddOrderModal', () => ({ default: () => null }));

describe('Orders page totals', () => {
  it('counts every unit in revenue and the average order', async () => {
    render(<Orders />);
    const revenue = (await screen.findByText('Revenue')).closest('.surface');
    expect(revenue).toHaveTextContent('৳2500');
    expect(screen.getByText('Average order').closest('.surface')).toHaveTextContent('৳1250');
  });
});
