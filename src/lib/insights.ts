import { differenceInCalendarDays } from 'date-fns';
import { parseDay } from '@/lib/dates';
import { countsForProfit, isSale } from '@/lib/constants';

/** A repeat customer quiet for longer than this is slipping away. */
export const SLIPPING_DAYS = 60;
/** Quiet for longer than this, they're gone rather than slipping. */
const GONE_DAYS = 365;
/** A channel needs this many orders before it's recommended. */
const MIN_CHANNEL_ORDERS = 3;

export interface InsightOrder {
  customer_name: string;
  customer_phone: string | null;
  date: string;
  status: string;
  source: string | null;
  selling_price: number;
  quantity: number;
  profit_per_order: number | null;
  ad_cost: number | null;
}

export interface InsightExpense {
  type: string;
  platform: string | null;
  amount: number;
  date: string;
}

export interface Customer {
  name: string;
  phone: string | null;
  orders: number;
  spent: number;
  lastOrder: string;
  daysSince: number;
}

/**
 * Customers from their sales (cancelled and returned orders don't count).
 * Few orders carry a phone number, so customers are matched by name, ignoring
 * case and extra spaces; the latest phone seen is kept for messaging them.
 */
export function getCustomers(orders: InsightOrder[], now = new Date()): Customer[] {
  const map = new Map<string, Customer>();
  for (const o of orders) {
    if (!isSale(o.status)) continue;
    const name = o.customer_name.trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const key = name.toLowerCase();
    let c = map.get(key);
    if (!c) map.set(key, c = { name, phone: null, orders: 0, spent: 0, lastOrder: o.date, daysSince: 0 });
    c.orders += 1;
    c.spent += o.selling_price * o.quantity;
    if (o.date >= c.lastOrder) {
      c.lastOrder = o.date;
      c.name = name;
      if (o.customer_phone) c.phone = o.customer_phone;
    } else if (!c.phone && o.customer_phone) {
      c.phone = o.customer_phone;
    }
  }
  return [...map.values()]
    .map((c) => ({ ...c, daysSince: differenceInCalendarDays(now, parseDay(c.lastOrder)) }))
    .sort((a, b) => b.spent - a.spent);
}

/** Customers who bought more than once but have gone quiet: worth a message. Biggest spenders first. */
export function slippingAway(customers: Customer[]): Customer[] {
  return customers.filter((c) => c.orders >= 2 && c.daysSince > SLIPPING_DAYS && c.daysSince <= GONE_DAYS);
}

export interface AdChannel {
  source: string;
  orders: number;
  revenue: number;
  /** Ads on the orders themselves plus Ad Spend expenses for this platform. */
  adSpend: number;
  /** Order profit less the Ad Spend expenses for this platform. */
  profitAfterAds: number;
  /** Profit after ads for each 1 spent on ads; null without ad spend. */
  perTaka: number | null;
}

/**
 * What each channel earned against what was spent advertising on it. A
 * channel with no ad spend still shows: those orders came for free.
 * Channels with ads come first, best return first.
 */
export function getAdChannels(orders: InsightOrder[], expenses: InsightExpense[]): AdChannel[] {
  const map = new Map<string, AdChannel>();
  const get = (source: string) => {
    let c = map.get(source);
    if (!c) map.set(source, c = { source, orders: 0, revenue: 0, adSpend: 0, profitAfterAds: 0, perTaka: null });
    return c;
  };
  for (const o of orders) {
    const c = get(o.source || 'Unknown');
    c.adSpend += o.ad_cost ?? 0;
    if (countsForProfit(o.status)) c.profitAfterAds += o.profit_per_order ?? 0;
    if (!isSale(o.status)) continue;
    c.orders += 1;
    c.revenue += o.selling_price * o.quantity;
  }
  for (const e of expenses) {
    if (e.type !== 'Ad Spend' || !e.platform) continue;
    const c = get(e.platform);
    c.adSpend += e.amount;
    c.profitAfterAds -= e.amount;
  }
  return [...map.values()]
    .map((c) => ({ ...c, perTaka: c.adSpend > 0 ? c.profitAfterAds / c.adSpend : null }))
    .sort((a, b) => (b.perTaka ?? -Infinity) - (a.perTaka ?? -Infinity) || b.profitAfterAds - a.profitAfterAds);
}

/** The advertised channel returning the most profit per 1 of ads, if it earns more than it costs. */
export function bestAdChannel(channels: AdChannel[]): AdChannel | null {
  const best = channels.find((c) => c.perTaka !== null && c.orders >= MIN_CHANNEL_ORDERS);
  return best && best.perTaka! > 0 ? best : null;
}

/** A WhatsApp chat link for a Bangladeshi mobile number, or null if it isn't one. */
export function whatsAppLink(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('01') && digits.length === 11) digits = `88${digits}`;
  return /^8801\d{9}$/.test(digits) ? `https://wa.me/${digits}` : null;
}
