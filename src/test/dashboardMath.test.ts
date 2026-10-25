import { describe, it, expect } from 'vitest';
import {
  activeOrders,
  computeKPIs,
  getRevenueBySource,
  getTopProducts,
} from '@/hooks/useDashboardData';
import { formatCurrency } from '@/hooks/useCurrency';

type Order = Parameters<typeof computeKPIs>[0][number];
type Item = Parameters<typeof computeKPIs>[1][number];
type Expense = Parameters<typeof computeKPIs>[2][number];

function order(overrides: Partial<Order>): Order {
  return {
    id: crypto.randomUUID(),
    order_number: 'ORD-001',
    customer_name: 'Rahim',
    product_id: 'p1',
    product_name: 'Panjabi',
    quantity: 1,
    selling_price: 0,
    unit_cost: 0,
    shipping_cost: 0,
    ad_cost: 0,
    source: 'Facebook',
    status: 'Pending',
    date: '2026-10-20',
    profit_per_order: 0,
    created_at: '2026-10-20T00:00:00Z',
    ...overrides,
  };
}

const panjabi: Item = {
  id: 'p1',
  product_name: 'Panjabi',
  sku: '',
  cost_price: 500, // today's cost — must NOT be used for past orders
  selling_price: 1200,
  stock_quantity: 4,
  low_stock_threshold: 5,
  supplier: '',
  created_at: '',
};

const orders = [
  // revenue 3000, cost 3 x 300 = 900, shipping 60, ad 100 → profit 1940
  order({ quantity: 3, selling_price: 1000, unit_cost: 300, shipping_cost: 60, ad_cost: 100, source: 'Facebook' }),
  // revenue 1200, cost 300, no extras → profit 900
  order({ quantity: 1, selling_price: 1200, unit_cost: 300, source: 'Instagram' }),
  // cancelled: must be ignored everywhere
  order({ quantity: 5, selling_price: 1000, unit_cost: 300, shipping_cost: 50, ad_cost: 50, status: 'Cancelled', source: 'WhatsApp' }),
];

const expenses: Expense[] = [
  { id: 'e1', type: 'Ad Spend', amount: 200, platform: 'Facebook', notes: '', date: '2026-10-20', created_at: '' },
  { id: 'e2', type: 'Miscellaneous', amount: 140, platform: '', notes: '', date: '2026-10-20', created_at: '' },
];

describe('computeKPIs', () => {
  const k = computeKPIs(orders, [panjabi], expenses);

  it('excludes cancelled orders from revenue and order count', () => {
    expect(k.totalRevenue).toBe(4200);
    expect(k.totalOrders).toBe(2);
  });

  it('uses the cost saved on each order, not the current product cost', () => {
    expect(k.cogs).toBe(1200); // 4 units x 300, not x 500
  });

  it('subtracts per-order shipping and ad costs and all expenses', () => {
    // 4200 - 1200 cogs - 60 shipping - 100 order ads - 340 expenses
    expect(k.netProfit).toBe(2500);
    expect(k.profitMargin).toBeCloseTo((2500 / 4200) * 100, 5);
  });

  it('combines expense ad spend with per-order ad costs', () => {
    expect(k.orderAdCost).toBe(100);
    expect(k.totalAdSpend).toBe(300);
  });

  it('flags products below their low-stock threshold', () => {
    expect(k.lowStockItems.map((i) => i.id)).toEqual(['p1']);
    const atThreshold = computeKPIs([], [{ ...panjabi, stock_quantity: 5 }], []);
    expect(atThreshold.lowStockItems).toHaveLength(0);
  });
});

describe('sales breakdowns', () => {
  it('leaves cancelled orders out of revenue by channel', () => {
    const channels = getRevenueBySource(orders).map((c) => c.name);
    expect(channels).toContain('Facebook');
    expect(channels).not.toContain('WhatsApp');
  });

  it('names products from the order when the product was deleted', () => {
    const deleted = order({ product_id: null, product_name: 'Old Saree', quantity: 2, selling_price: 900 });
    const top = getTopProducts([deleted], []);
    expect(top[0]).toMatchObject({ name: 'Old Saree', qty: 2, revenue: 1800 });
  });

  it('activeOrders drops only cancelled orders', () => {
    expect(activeOrders(orders)).toHaveLength(2);
  });
});

describe('formatCurrency', () => {
  it('uses lakh grouping for taka', () => {
    expect(formatCurrency(1234567, 'BDT')).toBe('৳12,34,567');
    expect(formatCurrency(999, 'BDT')).toBe('৳999');
  });

  it('uses the right symbol and grouping per currency', () => {
    expect(formatCurrency(1234567, 'INR')).toBe('₹12,34,567');
    expect(formatCurrency(1234567, 'USD')).toBe('$1,234,567');
  });

  it('handles negatives and rounding', () => {
    expect(formatCurrency(-1500.6, 'BDT')).toBe('-৳1,501');
  });
});
