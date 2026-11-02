import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { format, subDays } from 'date-fns';
import Insights from '@/pages/Insights';

const daysAgo = (n: number) => format(subDays(new Date(), n), 'yyyy-MM-dd');
const order = (o: Record<string, unknown>) => ({
  customer_name: 'Rahim', customer_phone: null, date: daysAgo(5), status: 'Delivered', source: 'Facebook',
  selling_price: 1000, quantity: 1, profit_per_order: 500, ad_cost: 0, ...o,
});

const mocks = vi.hoisted(() => ({ orders: [] as unknown[], expenses: [] as unknown[] }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order']) q[m] = () => q;
      q.range = () => Promise.resolve({ data: table === 'orders' ? mocks.orders : mocks.expenses, error: null });
      return q;
    },
  },
}));
vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ formatCurrency: (n: number) => `${n < 0 ? '-' : ''}৳${Math.abs(Math.round(n)).toLocaleString('en-US')}`, symbol: '৳' }),
}));

mocks.orders = [
  // Nusrat: a regular who went quiet, with a phone.
  order({ customer_name: 'Nusrat', date: daysAgo(150), selling_price: 6500, customer_phone: '01811111111' }),
  order({ customer_name: 'Nusrat', date: daysAgo(80), selling_price: 3000 }),
  // Karim: a regular who is still active.
  order({ customer_name: 'Karim', date: daysAgo(100) }),
  order({ customer_name: 'Karim', date: daysAgo(4), source: 'WhatsApp' }),
  // One-time buyers.
  order({ customer_name: 'Tania', date: daysAgo(20) }),
  order({ customer_name: 'Joy', date: daysAgo(20) }),
  order({ customer_name: 'Mitu', source: 'Instagram', profit_per_order: 300 }),
  order({ customer_name: 'Sadia', source: 'Instagram', profit_per_order: 300 }),
  order({ customer_name: 'Rafi', source: 'Instagram', profit_per_order: 300, date: daysAgo(40) }),
];
mocks.expenses = [
  { type: 'Ad Spend', platform: 'Facebook', amount: 400, date: daysAgo(10) },
  { type: 'Ad Spend', platform: 'Instagram', amount: 1500, date: daysAgo(10) },
];

describe('Insights page', () => {
  it('sums up customers and lists the regulars who went quiet, with a WhatsApp button', async () => {
    render(<Insights />);
    expect(await screen.findByText('Customers slipping away')).toBeInTheDocument();
    // 7 customers, 2 bought again.
    expect(screen.getByText('29%')).toBeInTheDocument();

    const slipping = screen.getByText('Customers slipping away').closest('section')!;
    expect(within(slipping).getByText('Nusrat')).toBeInTheDocument();
    expect(within(slipping).queryByText('Karim')).not.toBeInTheDocument();
    expect(within(slipping).getByRole('link', { name: 'Message Nusrat on WhatsApp' })).toHaveAttribute('href', 'https://wa.me/8801811111111');
  });

  it('shows where ad money works, for the chosen period', async () => {
    render(<Insights />);
    // 90 days: Facebook 3 orders × 500 − 400 ads = 1,100, ৳2.75 per ৳1. Instagram 900 − 1,500 = −600.
    expect(await screen.findByText('Facebook pays back best: every ৳1 on ads brought ৳2.75 profit.')).toBeInTheDocument();
    const instagram = screen.getAllByRole('row').find((r) => within(r).queryByText('Instagram'))!;
    expect(within(instagram).getByText('-৳600')).toHaveClass('text-destructive');
    const whatsapp = screen.getAllByRole('row').find((r) => within(r).queryByText('WhatsApp'))!;
    expect(within(whatsapp).getByText('No ads')).toBeInTheDocument();

    // All time adds Nusrat's order from 150 days ago and Karim's from 100 to Facebook.
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    const facebook = screen.getAllByRole('row').find((r) => within(r).queryByText('Facebook'))!;
    expect(within(facebook).getByText('5')).toBeInTheDocument();
  });
});
