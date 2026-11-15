import { describe, it, expect } from 'vitest';
import {
  activeOrders,
  computeKPIs,
  getChannels,
  getCollection,
  getRevenueBySource,
  getRevenueOverTime,
  getTopProducts,
  percentChange,
  previousPeriod,
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

describe('returned orders', () => {
  // Went out and came back: 80 delivery + 40 ads lost, nothing earned.
  const returned = order({ quantity: 2, selling_price: 1000, unit_cost: 300, shipping_cost: 80, ad_cost: 40, status: 'Returned', source: 'TikTok' });
  const k = computeKPIs([...orders, returned], [panjabi], expenses);

  it('are not sales: no revenue, product cost or order count', () => {
    expect(k.totalRevenue).toBe(4200);
    expect(k.cogs).toBe(1200);
    expect(k.totalOrders).toBe(2);
    expect(activeOrders([...orders, returned])).toHaveLength(2);
    expect(getRevenueBySource([returned])).toEqual([]);
  });

  it('still cost their delivery and ads', () => {
    expect(k.totalShipping).toBe(60 + 80);
    expect(k.orderAdCost).toBe(100 + 40);
    expect(k.netProfit).toBe(2500 - 120);
  });

  it('report how many came back and what they cost', () => {
    expect(k.returnedOrders).toBe(1);
    expect(k.returnLoss).toBe(120);
    expect(k.returnRate).toBeCloseTo(100 / 3, 5);
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
    expect(formatCurrency(1234567, 'USD')).toBe('$1,234,567');
  });

  it('handles negatives and rounding', () => {
    expect(formatCurrency(-1500.6, 'BDT')).toBe('-৳1,501');
  });
});

describe('Compared with the period before', () => {
  it('takes the same number of days just before the period', () => {
    // "7 days" on 2 Nov is 27 Oct to 2 Nov; before it, 20 to 26 Oct.
    const p = previousPeriod(new Date(2026, 9, 27), new Date(2026, 10, 2, 15, 30));
    expect(p.days).toBe(7);
    expect(p.from).toEqual(new Date(2026, 9, 20));
    expect(p.to).toEqual(new Date(2026, 9, 26));
  });

  it('gives the change in percent, and nothing when there was nothing before', () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(50, 100)).toBe(-50);
    // A loss that shrank is an improvement.
    expect(percentChange(-50, -100)).toBe(50);
    expect(percentChange(500, 0)).toBeNull();
  });
});

describe('Money still to collect', () => {
  it('splits sales into delivered and still to come, leaving out cancelled and returned', () => {
    const orders = [
      order({ status: 'Delivered', selling_price: 1000, quantity: 2 }),
      order({ status: 'Pending', selling_price: 500, quantity: 1 }),
      order({ status: 'Shipped', selling_price: 300, quantity: 1 }),
      order({ status: 'Processing', selling_price: 200, quantity: 1 }),
      order({ status: 'Cancelled', selling_price: 900, quantity: 1 }),
      order({ status: 'Returned', selling_price: 700, quantity: 1 }),
    ];
    expect(getCollection(orders)).toEqual({ delivered: 2000, toCollect: 1000 });
    // Together they are the revenue.
    expect(computeKPIs(orders, [], []).totalRevenue).toBe(3000);
  });
});

describe('Profit by product', () => {
  it("counts each product's own profit, with a return's lost delivery and ads against it", () => {
    const top = getTopProducts([
      order({ product_name: 'Lungi', product_id: null, quantity: 10, selling_price: 550, profit_per_order: 1200 }),
      order({ product_name: 'Saree', product_id: null, quantity: 1, selling_price: 6500, profit_per_order: 2580 }),
      order({ product_name: 'Saree', product_id: null, quantity: 1, selling_price: 6500, status: 'Returned', profit_per_order: -210 }),
      order({ product_name: 'Saree', product_id: null, quantity: 1, selling_price: 6500, status: 'Cancelled', profit_per_order: 2580 }),
    ], []);
    // By units the lungi leads; by profit the saree does.
    expect(top[0]).toMatchObject({ name: 'Lungi', qty: 10, revenue: 5500, profit: 1200 });
    expect(top[1]).toMatchObject({ name: 'Saree', qty: 1, revenue: 6500, profit: 2370 });
  });
});

describe('Channels', () => {
  it("shows each source's cancels and returns, and its profit after them, best first", () => {
    const channels = getChannels([
      order({ selling_price: 1000, source: 'Facebook', profit_per_order: 500 }),
      order({ selling_price: 1000, source: 'Facebook', status: 'Cancelled', profit_per_order: 500 }),
      order({ selling_price: 1000, source: 'Facebook', status: 'Returned', profit_per_order: -180 }),
      order({ selling_price: 1000, source: 'Facebook', profit_per_order: 500 }),
      order({ selling_price: 1000, source: 'WhatsApp', profit_per_order: 900 }),
      order({ selling_price: 1000, source: 'WhatsApp', profit_per_order: 900 }),
      order({ selling_price: 1000, source: '', profit_per_order: 100 }),
    ]);
    expect(channels.map((c) => c.source)).toEqual(['WhatsApp', 'Facebook', 'Unknown']);
    expect(channels[1]).toMatchObject({ orders: 4, cancelled: 1, returned: 1, lostRate: 50, revenue: 2000, profit: 820 });
    expect(channels[0]).toMatchObject({ orders: 2, lostRate: 0, profit: 1800 });
  });
});

describe('Sales over time', () => {
  it('runs oldest to newest even though orders arrive newest first', () => {
    const orders = [
      order({ date: '2026-11-10', selling_price: 300, status: 'Delivered' }),
      order({ date: '2026-11-03', selling_price: 200, status: 'Delivered' }),
      order({ date: '2026-11-03', selling_price: 50, status: 'Delivered' }),
      order({ date: '2026-10-28', selling_price: 100, status: 'Delivered' }),
    ];
    expect(getRevenueOverTime(orders, 'daily')).toEqual([
      { date: '28 Oct', revenue: 100 },
      { date: '3 Nov', revenue: 250 },
      { date: '10 Nov', revenue: 300 },
    ]);
    expect(getRevenueOverTime(orders, 'monthly').map((p) => p.date)).toEqual(['Oct 2026', 'Nov 2026']);
  });
});
