import { describe, it, expect } from 'vitest';
import { format, subDays } from 'date-fns';
import { findAttention, type AttentionOrder } from '@/lib/attention';

const NOW = new Date(2026, 10, 2, 14, 0);
const daysAgo = (n: number) => format(subDays(NOW, n), 'yyyy-MM-dd');

function order(overrides: Partial<AttentionOrder> & { ago?: number }): AttentionOrder {
  const { ago = 0, ...rest } = overrides;
  return { order_number: 'ORD-001', status: 'Delivered', date: daysAgo(ago), product_id: null, quantity: 1, selling_price: 1000, ...rest };
}

const kinds = (items: ReturnType<typeof findAttention>) => items.map((i) => i.kind);

describe('Needs your attention', () => {
  it('stays empty when all is well', () => {
    const orders = [order({ ago: 1 }), order({ status: 'Pending', ago: 1 }), order({ status: 'Shipped', ago: 4 })];
    expect(findAttention(orders, [], NOW)).toEqual([]);
  });

  it('flags shipped orders not delivered after a week, with the cash at stake', () => {
    const orders = [
      order({ status: 'Shipped', ago: 8, selling_price: 2950 }),
      order({ status: 'Shipped', ago: 12, selling_price: 1500, quantity: 2 }),
      order({ status: 'Shipped', ago: 7 }), // exactly a week: not yet
    ];
    expect(findAttention(orders, [], NOW)).toEqual([{ kind: 'stuck', count: 2, amount: 5950 }]);
  });

  it('flags orders waiting more than 3 days to be sent', () => {
    const orders = [
      order({ status: 'Pending', ago: 5 }),
      order({ status: 'Processing', ago: 9, selling_price: 500 }),
      order({ status: 'Pending', ago: 3 }),
    ];
    expect(findAttention(orders, [], NOW)).toEqual([{ kind: 'waiting', count: 2, amount: 1500, oldestDays: 9 }]);
  });

  it('flags cancels and returns that climbed against the month before', () => {
    const orders = [
      // Last 30 days: 2 of 10 cancelled or returned (20%).
      ...Array.from({ length: 8 }, () => order({ ago: 3 })),
      order({ status: 'Cancelled', ago: 2 }),
      order({ status: 'Returned', ago: 10 }),
      // The 30 days before: 0 of 10.
      ...Array.from({ length: 10 }, () => order({ ago: 40 })),
    ];
    expect(findAttention(orders, [], NOW)).toEqual([{ kind: 'returns', rate: 20, previousRate: 0, bad: 2, total: 10 }]);
  });

  it('stays quiet about cancels when the rate is steady and below a quarter', () => {
    const steady = [
      ...Array.from({ length: 8 }, () => order({ ago: 3 })),
      order({ status: 'Cancelled', ago: 2 }), order({ status: 'Cancelled', ago: 2 }),
      ...Array.from({ length: 8 }, () => order({ ago: 40 })),
      order({ status: 'Cancelled', ago: 40 }), order({ status: 'Returned', ago: 40 }),
    ];
    expect(kinds(findAttention(steady, [], NOW))).not.toContain('returns');
    // Too few orders to judge.
    const quiet = [order({ status: 'Cancelled' }), order({ status: 'Cancelled' }), order({})];
    expect(kinds(findAttention(quiet, [], NOW))).not.toContain('returns');
  });

  it('warns when a selling product will run out within a week, soonest first', () => {
    const orders = [
      // Saree: 12 sold in 30 days, 2 left → 5 days.
      ...Array.from({ length: 12 }, () => order({ product_id: 'saree', ago: 5 })),
      // Kurti: 30 sold, 3 left → 3 days.
      order({ product_id: 'kurti', quantity: 30, ago: 2 }),
      // Lungi: 3 sold, 20 left → 200 days, fine.
      order({ product_id: 'lungi', quantity: 3, ago: 2 }),
      // Sold 60 days ago only: not selling now.
      order({ product_id: 'old', quantity: 9, ago: 60 }),
    ];
    const products = [
      { id: 'saree', product_name: 'Jamdani Saree', stock_quantity: 2 },
      { id: 'kurti', product_name: 'Printed Kurti', stock_quantity: 3 },
      { id: 'lungi', product_name: 'Lungi', stock_quantity: 20 },
      { id: 'old', product_name: 'Old item', stock_quantity: 1 },
    ];
    expect(findAttention(orders, products, NOW)).toEqual([
      { kind: 'runway', productId: 'kurti', name: 'Printed Kurti', stock: 3, daysLeft: 3, perWeek: 7 },
      { kind: 'runway', productId: 'saree', name: 'Jamdani Saree', stock: 2, daysLeft: 5, perWeek: 3 },
    ]);
  });

  it('puts a selling product that is already out of stock first', () => {
    const orders = [order({ product_id: 'p1', quantity: 4, ago: 3 }), order({ product_id: 'p2', quantity: 30, ago: 3 })];
    const products = [
      { id: 'p2', product_name: 'Silk Panjabi', stock_quantity: 2 },
      { id: 'p1', product_name: 'Cotton Panjabi', stock_quantity: 0 },
    ];
    expect(kinds(findAttention(orders, products, NOW))).toEqual(['soldOut', 'runway']);
  });

  it('cancelled and returned orders are not sales for the stock pace', () => {
    const orders = [order({ product_id: 'p1', status: 'Cancelled', quantity: 50, ago: 1 })];
    expect(findAttention(orders, [{ id: 'p1', product_name: 'X', stock_quantity: 1 }], NOW)).toEqual([]);
  });
});
