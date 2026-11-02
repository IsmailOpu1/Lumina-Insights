import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import NeedsAttention from '@/components/dashboard/NeedsAttention';

const mocks = vi.hoisted(() => ({ recent: [] as unknown[], older: [] as unknown[] }));
const daysAgo = (n: number) => format(subDays(new Date(), n), 'yyyy-MM-dd');

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      let older = false;
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'gte', 'order']) q[m] = () => q;
      q.lt = () => { older = true; return q; };
      q.filter = () => q;
      q.range = () => Promise.resolve({ data: older ? mocks.older : mocks.recent, error: null });
      return q;
    },
  },
}));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => ({ formatCurrency: (n: number) => `৳${n.toLocaleString('en-US')}` }) }));

function Where() {
  const l = useLocation();
  return <p>at {l.pathname}{l.search}</p>;
}

function renderStrip(products = [] as { id: string; product_name: string; stock_quantity: number }[]) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<NeedsAttention products={products} reloadKey={1} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.recent = [];
  mocks.older = [];
});

const order = (o: Record<string, unknown>) => ({ order_number: 'ORD-1', status: 'Delivered', date: daysAgo(1), product_id: null, quantity: 1, selling_price: 1000, ...o });

describe('Needs your attention strip', () => {
  it('lists what needs doing and opens the matching orders', async () => {
    mocks.recent = [order({ status: 'Shipped', date: daysAgo(10), selling_price: 2950 })];
    // A shipped order from before the 60-day window still counts.
    mocks.older = [order({ status: 'Shipped', date: daysAgo(70), selling_price: 1500 })];
    renderStrip();

    expect(await screen.findByText('Needs your attention')).toBeInTheDocument();
    expect(screen.getByText('2 shipped orders not delivered after 7 days')).toBeInTheDocument();
    expect(screen.getByText('৳4,450 cash on delivery at risk. Check with your courier.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /shipped orders not delivered/ }));
    expect(screen.getByText('at /orders?status=Shipped')).toBeInTheDocument();
  });

  it('warns about a product about to run out', async () => {
    mocks.recent = [order({ product_id: 'p1', quantity: 15, date: daysAgo(3) })];
    renderStrip([{ id: 'p1', product_name: 'Jamdani Saree', stock_quantity: 2 }]);
    expect(await screen.findByText('Jamdani Saree: about 4 days of stock left')).toBeInTheDocument();
    expect(screen.getByText('2 left, selling about 4 a week')).toBeInTheDocument();
  });

  it('shows nothing when all is well', async () => {
    mocks.recent = [order({})];
    const { container } = renderStrip();
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
