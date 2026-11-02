import { differenceInCalendarDays } from 'date-fns';
import { parseDay } from '@/lib/dates';
import { isSale } from '@/lib/constants';

/**
 * Things on the dashboard that need the seller now. Each rule stays quiet
 * until there is something to do, so an empty list means all is well.
 */

/** Pending or processing longer than this: the customer is still waiting. */
export const WAITING_DAYS = 3;
/** Shipped longer ago than this and still not delivered: lost or refused. */
export const STUCK_DAYS = 7;
/** Warn when a product has this many days of stock or fewer at its sales pace. */
export const RUNWAY_DAYS = 7;
/** Sales pace and cancel/return rates are measured over this many days. */
export const WINDOW_DAYS = 30;
const MAX_RUNWAY_ITEMS = 3;

export interface AttentionOrder {
  order_number: string;
  status: string;
  date: string;
  product_id: string | null;
  quantity: number;
  selling_price: number;
}

export interface AttentionProduct {
  id: string;
  product_name: string;
  stock_quantity: number;
}

export type Attention =
  | { kind: 'waiting'; count: number; amount: number; oldestDays: number }
  | { kind: 'stuck'; count: number; amount: number }
  | { kind: 'returns'; rate: number; previousRate: number | null; bad: number; total: number }
  | { kind: 'runway'; productId: string; name: string; stock: number; daysLeft: number; perWeek: number }
  | { kind: 'soldOut'; productId: string; name: string; sold: number };

const value = (o: AttentionOrder) => o.selling_price * o.quantity;

/** `orders` should reach back 2 × WINDOW_DAYS so the cancel/return rate has a period to compare with. */
export function findAttention(orders: AttentionOrder[], products: AttentionProduct[], now = new Date()): Attention[] {
  const age = (o: AttentionOrder) => differenceInCalendarDays(now, parseDay(o.date));
  const items: Attention[] = [];

  const stuck = orders.filter((o) => o.status === 'Shipped' && age(o) > STUCK_DAYS);
  if (stuck.length) {
    items.push({ kind: 'stuck', count: stuck.length, amount: stuck.reduce((s, o) => s + value(o), 0) });
  }

  const waiting = orders.filter((o) => (o.status === 'Pending' || o.status === 'Processing') && age(o) > WAITING_DAYS);
  if (waiting.length) {
    items.push({
      kind: 'waiting',
      count: waiting.length,
      amount: waiting.reduce((s, o) => s + value(o), 0),
      oldestDays: Math.max(...waiting.map(age)),
    });
  }

  const returns = returnsRule(orders, age);
  if (returns) items.push(returns);

  // Sales pace per product over the last WINDOW_DAYS.
  const sold = new Map<string, number>();
  for (const o of orders) {
    if (o.product_id && isSale(o.status) && age(o) < WINDOW_DAYS) {
      sold.set(o.product_id, (sold.get(o.product_id) ?? 0) + o.quantity);
    }
  }
  type StockItem = Extract<Attention, { kind: 'runway' | 'soldOut' }>;
  const stock: StockItem[] = [];
  for (const p of products) {
    const units = sold.get(p.id) ?? 0;
    if (!units) continue;
    if (p.stock_quantity <= 0) {
      stock.push({ kind: 'soldOut', productId: p.id, name: p.product_name, sold: units });
      continue;
    }
    const daysLeft = p.stock_quantity / (units / WINDOW_DAYS);
    if (daysLeft <= RUNWAY_DAYS) {
      stock.push({
        kind: 'runway', productId: p.id, name: p.product_name, stock: p.stock_quantity,
        daysLeft: Math.max(1, Math.floor(daysLeft)), perWeek: Math.round((units / WINDOW_DAYS) * 7),
      });
    }
  }
  // Sold out first, then the soonest to run out.
  const soon = (i: StockItem) => (i.kind === 'soldOut' ? 0 : i.daysLeft);
  stock.sort((a, b) => soon(a) - soon(b));
  items.push(...stock.slice(0, MAX_RUNWAY_ITEMS));

  return items;
}

/**
 * Cancels and returns over the last WINDOW_DAYS: flagged when they are a
 * quarter of all orders, or have risen by 5 points or more to at least 10%.
 * Needs a few orders first, so one cancel in a quiet week isn't an alarm.
 */
function returnsRule(orders: AttentionOrder[], age: (o: AttentionOrder) => number): Attention | null {
  const now = orders.filter((o) => age(o) < WINDOW_DAYS);
  const before = orders.filter((o) => age(o) >= WINDOW_DAYS && age(o) < WINDOW_DAYS * 2);
  const badNow = now.filter((o) => !isSale(o.status)).length;
  if (now.length < 5 || badNow < 2) return null;

  const rate = (badNow / now.length) * 100;
  const previousRate = before.length >= 5 ? (before.filter((o) => !isSale(o.status)).length / before.length) * 100 : null;
  const rising = previousRate !== null && rate >= 10 && rate - previousRate >= 5;
  if (rate < 25 && !rising) return null;
  return { kind: 'returns', rate, previousRate, bad: badNow, total: now.length };
}
