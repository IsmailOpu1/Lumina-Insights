import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { FilterProvider, useFilter } from '@/context/FilterContext';

const mocks = vi.hoisted(() => ({
  setDateFilter: vi.fn(),
  dateFilter: '7days',
  orders: [] as unknown[],
  latest: [{ date: '2026-09-05' }] as unknown[],
}));

function query(data: unknown[]) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'order', 'limit', 'maybeSingle']) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data, error: null });
  return q;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => query(mocks.latest) },
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ ownerIdForQueries: null, userSettings: null }) }));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => ({ formatCurrency: String, symbol: '৳' }) }));
vi.mock('@/hooks/useDashboardData', () => ({
  useDashboardData: () => ({ orders: mocks.orders, inventory: [], expenses: [], loading: false, refetch: vi.fn() }),
  computeKPIs: () => ({
    totalRevenue: 0, netProfit: 0, profitMargin: 0, totalOrders: 0, repeatCustomers: 0, inventoryValue: 0,
    lowStockItems: [], topCustomer: null, totalAdSpend: 0, cogs: 0, totalShipping: 0, adSpend: 0, orderAdCost: 0,
  }),
  getRevenueBySource: () => [], getOrdersByStatus: () => [], getTopProducts: () => [],
}));
for (const c of ['DateFilterBar', 'KPICards', 'RevenueGrowthChart', 'ProfitBreakdownPie', 'SalesBySourcePie',
  'TopSellingProductsBar', 'OrderStatusPie', 'InventoryAlerts', 'BusinessMetrics', 'RecentOrdersTable', 'ProfitCalculator']) {
  vi.doMock(`@/components/dashboard/${c}`, () => ({ default: () => null }));
}

beforeEach(() => {
  mocks.setDateFilter.mockReset();
  mocks.dateFilter = '7days';
  mocks.orders = [];
  mocks.latest = [{ date: '2026-09-05' }];
});

describe('Dashboard period with no sales', () => {
  async function renderDashboard() {
    vi.doMock('@/context/FilterContext', () => ({
      useFilter: () => ({ dateFilter: mocks.dateFilter, setDateFilter: mocks.setDateFilter }),
    }));
    vi.resetModules();
    const { default: Dashboard } = await import('@/pages/Dashboard');
    render(<Dashboard />);
  }

  it('says when the latest sale was and offers all time', async () => {
    await renderDashboard();
    expect(await screen.findByText(/Your latest sale was on 5 September 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all time' }));
    expect(mocks.setDateFilter).toHaveBeenCalledWith('all');
  });

  it('stays quiet for a new business with no sales at all', async () => {
    mocks.latest = [];
    await renderDashboard();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/latest sale/)).not.toBeInTheDocument();
  });

  it('stays quiet when the period has sales', async () => {
    mocks.orders = [{ id: 'o1' }];
    await renderDashboard();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/latest sale/)).not.toBeInTheDocument();
  });
});

describe('All time range', () => {
  it('reaches back to 2000 for imported history', () => {
    const { result } = renderHook(() => useFilter(), { wrapper: FilterProvider });
    act(() => result.current.setDateFilter('all'));
    expect(result.current.getDateRange().from).toEqual(new Date(2000, 0, 1));
  });
});
