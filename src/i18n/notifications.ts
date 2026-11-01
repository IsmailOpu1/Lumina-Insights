import { tr } from '@/i18n';

/**
 * Notifications are written in English by database triggers (see the
 * notify_* functions). These patterns turn each known sentence into a
 * translatable one; names, numbers and amounts are kept as written.
 * Anything unrecognised is shown as it is.
 */
const PATTERNS: [RegExp, string, string[]][] = [
  [/^Order (\S+) from (.+) for (\S+)$/, 'Order {order} from {customer} for {amount}', ['order', 'customer', 'amount']],
  [/^Order (\S+) from (.+) was returned$/, 'Order {order} from {customer} was returned', ['order', 'customer']],
  [/^Order (\S+) from (.+) was cancelled$/, 'Order {order} from {customer} was cancelled', ['order', 'customer']],
  [/^(.+) is out of stock!$/, '{product} is out of stock!', ['product']],
  [/^(.+) is running low \((\d+) units left\)$/, '{product} is running low ({n} units left)', ['product', 'n']],
  [/^Order (\S+) has a low margin of (-?[\d.]+)%$/, 'Order {order} has a low margin of {pct}%', ['order', 'pct']],
  [/^Order (\S+) has ROAS of (-?[\d.]+)x \(below ([\d.]+)x threshold\)$/, 'Order {order} has ROAS of {roas}x (below {target}x threshold)', ['order', 'roas', 'target']],
  [/^Imported (\d+) orders, (\d+) products and (\d+) expenses from (.+)$/, 'Imported {orders} orders, {products} products and {expenses} expenses from {file}', ['orders', 'products', 'expenses', 'file']],
  [/^Last 7 days: (\S+) revenue from (\d+) orders?, (\S+) net profit \(up (\d+)% vs the week before\)\.$/, 'Last 7 days: {revenue} revenue from {orders} orders, {profit} net profit (up {pct}% vs the week before).', ['revenue', 'orders', 'profit', 'pct']],
  [/^Last 7 days: (\S+) revenue from (\d+) orders?, (\S+) net profit \(down (\d+)% vs the week before\)\.$/, 'Last 7 days: {revenue} revenue from {orders} orders, {profit} net profit (down {pct}% vs the week before).', ['revenue', 'orders', 'profit', 'pct']],
  [/^Last 7 days: (\S+) revenue from (\d+) orders?, (\S+) net profit\.$/, 'Last 7 days: {revenue} revenue from {orders} orders, {profit} net profit.', ['revenue', 'orders', 'profit']],
];

// Titles are fixed per notification type.
const TITLES = [
  'New Order Received', 'Order Cancelled', 'Order Returned', 'Critical Stock Alert', 'Low Stock Alert',
  'Low Profit Margin Alert', 'Low ROAS Alert', 'Import complete', 'Weekly Summary',
];

export function notificationText(n: { title: string; message: string }) {
  let message = n.message;
  for (const [pattern, key, names] of PATTERNS) {
    const m = pattern.exec(n.message);
    if (m) {
      message = tr(key, Object.fromEntries(names.map((name, i) => [name, m[i + 1]])));
      break;
    }
  }
  return { title: TITLES.includes(n.title) ? tr(n.title) : n.title, message };
}

/** For the dictionary test: every key used above. */
export const NOTIFICATION_KEYS = [...TITLES, ...PATTERNS.map(([, key]) => key)];
