import { describe, it, expect } from 'vitest';
import { format, subDays } from 'date-fns';
import { forecastMonth, goalProgress, type ForecastOrder } from '@/lib/forecast';

// 10 November 2026, afternoon: 20 days left after today.
const NOW = new Date(2026, 10, 10, 15, 0);
const day = (n: number) => format(subDays(NOW, n), 'yyyy-MM-dd');

function sale(ago: number, price = 1000, overrides: Partial<ForecastOrder> = {}): ForecastOrder {
  return { date: day(ago), status: 'Delivered', selling_price: price, quantity: 1, profit_per_order: price * 0.4, ...overrides };
}

describe('Month-end forecast', () => {
  it('adds the recent daily pace for the days left to the month so far', () => {
    // One ৳1,000 sale every day for the last 30 full days, and today.
    const orders = [sale(0), ...Array.from({ length: 30 }, (_, i) => sale(i + 1))];
    const f = forecastMonth(orders, [], day(60), NOW);

    expect(f.daysLeft).toBe(20);
    // 1–10 November: 10 sales.
    expect(f.revenueSoFar).toBe(10_000);
    expect(f.profitSoFar).toBe(4_000);
    // A steady ৳1,000 a day: 10,000 + 20 × 1,000, and no spread.
    expect(f.revenue).toEqual({ low: 30_000, mid: 30_000, high: 30_000 });
    expect(f.profit).toEqual({ low: 12_000, mid: 12_000, high: 12_000 });
  });

  it('widens the range when sales jump around, never below what is already sold', () => {
    // ৳3,000 every third day: same ৳1,000 a day on average, but lumpy.
    const orders = Array.from({ length: 30 }, (_, i) => sale(i + 1, (i + 1) % 3 === 0 ? 3000 : 0));
    const f = forecastMonth(orders.filter((o) => o.selling_price > 0), [], day(60), NOW);
    expect(f.revenue!.mid).toBeCloseTo(f.revenueSoFar + 20_000);
    expect(f.revenue!.high).toBeGreaterThan(f.revenue!.mid);
    expect(f.revenue!.low).toBeLessThan(f.revenue!.mid);
    expect(f.revenue!.low).toBeGreaterThanOrEqual(f.revenueSoFar);
  });

  it('takes expenses off the profit, and leaves out cancelled orders', () => {
    const orders = [
      ...Array.from({ length: 30 }, (_, i) => sale(i + 1)),
      sale(2, 5000, { status: 'Cancelled', profit_per_order: 2000 }),
    ];
    // ৳3,000 of ads on 1 November.
    const f = forecastMonth(orders, [{ date: day(9), amount: 3000 }], day(60), NOW);
    expect(f.revenueSoFar).toBe(9_000);
    expect(f.profitSoFar).toBe(9 * 400 - 3000);
    // Pace: (30 × 400 − 3,000) / 30 = ৳300 a day.
    expect(f.profit!.mid).toBeCloseTo(600 + 20 * 300);
  });

  it("averages a young shop over the days it has existed, not 30", () => {
    // Opened 10 days ago, ৳1,000 a day since.
    const orders = Array.from({ length: 10 }, (_, i) => sale(i + 1));
    const f = forecastMonth(orders, [], day(10), NOW);
    expect(f.revenue!.mid).toBe(f.revenueSoFar + 20_000);
  });

  it('does not guess with too little history or too few sales', () => {
    expect(forecastMonth([sale(1), sale(2)], [], day(3), NOW).revenue).toBeNull();
    expect(forecastMonth([sale(1), sale(20)], [], day(60), NOW).revenue).toBeNull();
    expect(forecastMonth([], [], null, NOW).profit).toBeNull();
  });
});

describe('Monthly goal', () => {
  const orders = Array.from({ length: 30 }, (_, i) => sale(i + 1));
  const f = forecastMonth(orders, [], day(60), NOW); // ৳9,000 so far, heading for ৳29,000

  it('says how far along it is and what each remaining day needs', () => {
    const g = goalProgress(30_000, f, NOW);
    expect(g.pct).toBeCloseTo(30);
    // ৳21,000 to go over 21 days (today included).
    expect(g.perDay).toBeCloseTo(1_000);
    expect(g.onTrack).toBe(false);
    expect(g.reached).toBe(false);
  });

  it('knows when the pace will make it, and when it is already reached', () => {
    expect(goalProgress(25_000, f, NOW).onTrack).toBe(true);
    const done = goalProgress(5_000, f, NOW);
    expect(done).toMatchObject({ reached: true, pct: 100, perDay: null });
  });
});
