import { describe, expect, it } from 'vitest';
import { orderProfit } from '@/lib/constants';

describe('the profit an order shows', () => {
  it('is the stored profit for orders that count', () => {
    expect(orderProfit('Delivered', 1490)).toBe(1490);
    expect(orderProfit('Pending', null)).toBe(0);
    expect(orderProfit('Returned', -180)).toBe(-180);
  });

  it('is nothing for a cancelled order, whatever it would have earned', () => {
    expect(orderProfit('Cancelled', 1490)).toBeNull();
  });
});
