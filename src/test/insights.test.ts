import { describe, it, expect } from 'vitest';
import { format, subDays } from 'date-fns';
import { bestAdChannel, getAdChannels, getCustomers, slippingAway, whatsAppLink, type InsightOrder } from '@/lib/insights';

const NOW = new Date(2026, 10, 2, 12, 0);
const daysAgo = (n: number) => format(subDays(NOW, n), 'yyyy-MM-dd');

function order(o: Partial<InsightOrder> & { ago?: number }): InsightOrder {
  const { ago = 1, ...rest } = o;
  return {
    customer_name: 'Rahim', customer_phone: null, date: daysAgo(ago), status: 'Delivered', source: 'Facebook',
    selling_price: 1000, quantity: 1, profit_per_order: 400, ad_cost: 0, ...rest,
  };
}

describe('Customers', () => {
  it('groups by name ignoring case and spaces, keeps the latest phone, leaves out cancelled orders', () => {
    const customers = getCustomers([
      order({ customer_name: 'Rahim  Uddin', ago: 90, customer_phone: '01711111111' }),
      order({ customer_name: 'rahim uddin', ago: 70, selling_price: 2500 }),
      order({ customer_name: 'Rahim Uddin', ago: 5, status: 'Cancelled', selling_price: 9000 }),
      order({ customer_name: 'Nadia', ago: 3 }),
    ], NOW);
    expect(customers[0]).toEqual({ name: 'rahim uddin', phone: '01711111111', orders: 2, spent: 3500, lastOrder: daysAgo(70), daysSince: 70 });
    expect(customers[1]).toMatchObject({ name: 'Nadia', orders: 1, daysSince: 3 });
  });

  it('finds repeat customers who went quiet, not one-time buyers, recent ones or long gone ones', () => {
    const customers = getCustomers([
      order({ customer_name: 'Quiet', ago: 100 }), order({ customer_name: 'Quiet', ago: 80, selling_price: 3000 }),
      order({ customer_name: 'Recent', ago: 100 }), order({ customer_name: 'Recent', ago: 10 }),
      order({ customer_name: 'Once', ago: 120 }),
      order({ customer_name: 'Gone', ago: 500 }), order({ customer_name: 'Gone', ago: 400 }),
    ], NOW);
    expect(slippingAway(customers).map((c) => c.name)).toEqual(['Quiet']);
  });
});

describe('Ad channels', () => {
  const orders = [
    ...Array.from({ length: 4 }, () => order({ source: 'Facebook', profit_per_order: 1000 })),
    ...Array.from({ length: 4 }, () => order({ source: 'Instagram', profit_per_order: 500 })),
    order({ source: 'Instagram', status: 'Returned', profit_per_order: -200 }),
    order({ source: 'WhatsApp', profit_per_order: 900 }),
    order({ source: 'TikTok', profit_per_order: 300, ad_cost: 100 }),
  ];
  const expenses = [
    { type: 'Ad Spend', platform: 'Facebook', amount: 1000, date: daysAgo(5) },
    { type: 'Ad Spend', platform: 'Instagram', amount: 2000, date: daysAgo(5) },
    { type: 'Shipping', platform: 'Pathao', amount: 500, date: daysAgo(5) },
  ];

  it('sets profit after ads against ad spend, best return first, free channels last', () => {
    const channels = getAdChannels(orders, expenses);
    expect(channels.map((c) => c.source)).toEqual(['Facebook', 'TikTok', 'Instagram', 'WhatsApp']);
    // 4 × 1,000 profit − 1,000 ads = 3,000: ৳3 profit for each ৳1 of ads.
    expect(channels[0]).toMatchObject({ orders: 4, revenue: 4000, adSpend: 1000, profitAfterAds: 3000, perTaka: 3 });
    // 4 × 500 − 200 (return) − 2,000 ads = −200.
    expect(channels[2]).toMatchObject({ orders: 4, adSpend: 2000, profitAfterAds: -200, perTaka: -0.1 });
    // TikTok's ad cost was on the order, already inside its profit.
    expect(channels[1]).toMatchObject({ adSpend: 100, profitAfterAds: 300, perTaka: 3 });
    expect(channels[3]).toMatchObject({ adSpend: 0, perTaka: null });
    // Shipping expenses aren't ads.
    expect(channels.find((c) => c.source === 'Pathao')).toBeUndefined();
  });

  it('recommends a channel only with enough orders and a profit', () => {
    expect(bestAdChannel(getAdChannels(orders, expenses))?.source).toBe('Facebook');
    const losing = getAdChannels(orders.filter((o) => o.source === 'Instagram'), expenses.slice(1));
    expect(bestAdChannel(losing)).toBeNull();
  });
});

describe('WhatsApp link', () => {
  it('turns a Bangladeshi mobile number into a chat link', () => {
    expect(whatsAppLink('01712-345678')).toBe('https://wa.me/8801712345678');
    expect(whatsAppLink('+8801812345678')).toBe('https://wa.me/8801812345678');
    expect(whatsAppLink('12345')).toBeNull();
    expect(whatsAppLink(null)).toBeNull();
  });
});
