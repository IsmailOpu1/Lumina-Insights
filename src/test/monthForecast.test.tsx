import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { format, subDays } from 'date-fns';
import MonthForecast from '@/components/dashboard/MonthForecast';

// 10 November 2026: 9,000 sold so far, ৳1,000 a day, 20 days left.
const NOW = new Date(2026, 10, 10, 15, 0);
const day = (n: number) => format(subDays(NOW, n), 'yyyy-MM-dd');

const mocks = vi.hoisted(() => ({
  isOwner: true,
  goal: null as number | null,
  update: vi.fn(),
  orders: [] as unknown[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'gte', 'order', 'eq']) q[m] = () => q;
      q.range = () => Promise.resolve({ data: table === 'orders' ? mocks.orders : [], error: null });
      q.limit = () => Promise.resolve({ data: [{ date: day(60) }], error: null });
      q.maybeSingle = () => Promise.resolve({ data: { monthly_revenue_goal: mocks.goal }, error: null });
      q.update = (row: unknown) => { mocks.update(row); return { eq: () => Promise.resolve({ error: null }) }; };
      return q;
    },
  },
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ ownerIdForQueries: 'owner-1', isOwner: mocks.isOwner }) }));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => ({ formatCurrency: (n: number) => `৳${Math.round(n).toLocaleString('en-US')}` }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mocks.isOwner = true;
  mocks.goal = null;
  mocks.update.mockReset();
  mocks.orders = Array.from({ length: 30 }, (_, i) => ({
    date: day(i + 1), status: 'Delivered', selling_price: 1000, quantity: 1, profit_per_order: 400,
  }));
});
afterEach(() => vi.useRealTimers());

describe('This month card', () => {
  it('shows the month so far and where it is heading', async () => {
    render(<MonthForecast reloadKey={1} />);
    expect(await screen.findByText('November so far')).toBeInTheDocument();
    expect(screen.getByText('৳9,000')).toBeInTheDocument();
    expect(screen.getByText('৳29,000')).toBeInTheDocument();
    expect(screen.getByText(/20 days left/)).toBeInTheDocument();
  });

  it('the owner sets a goal and sees what each day needs', async () => {
    render(<MonthForecast reloadKey={1} />);
    fireEvent.click(await screen.findByRole('button', { name: /Set a monthly goal/ }));
    fireEvent.change(screen.getByLabelText('Monthly revenue goal'), { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ monthly_revenue_goal: 30000 }));
    expect(await screen.findByText('30% there')).toBeInTheDocument();
    // ৳21,000 to go over 21 days.
    expect(screen.getByText('Behind: you need about ৳1,000 a day to reach it.')).toBeInTheDocument();
  });

  it('managers and viewers see the goal but cannot change it', async () => {
    mocks.isOwner = false;
    mocks.goal = 25000;
    render(<MonthForecast reloadKey={1} />);
    expect(await screen.findByText('36% there')).toBeInTheDocument();
    expect(screen.getByText(/On track/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /goal/ })).not.toBeInTheDocument();
  });

  it('waits for a week of sales before forecasting', async () => {
    mocks.orders = mocks.orders.slice(0, 3);
    render(<MonthForecast reloadKey={1} />);
    expect(await screen.findByText('A forecast appears after a week with at least 5 sales.')).toBeInTheDocument();
  });
});
