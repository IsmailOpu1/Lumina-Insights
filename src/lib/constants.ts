export const STATUS_COLORS: Record<string, string> = {
  Pending: '#F59E0B',
  Processing: '#3B82F6',
  Shipped: '#60A5FA',
  Delivered: '#10B981',
  Cancelled: '#EF4444',
};

export const SOURCES = ['Instagram', 'Facebook', 'WhatsApp', 'Website', 'TikTok'] as const;
export type Source = (typeof SOURCES)[number];

export const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const EXPENSE_TYPES = ['Ad Spend', 'Shipping', 'Miscellaneous'] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const MARKETING_PLATFORMS = ['Facebook', 'Instagram', 'TikTok'] as const;

export function formatTaka(amount: number): string {
  if (amount < 0) return '-' + formatTaka(-amount);
  const str = Math.round(amount).toString();
  if (str.length <= 3) return '৳' + str;

  // Bangladeshi lakh formatting: last 3 digits, then groups of 2
  const last3 = str.slice(-3);
  let remaining = str.slice(0, -3);
  const parts: string[] = [];
  while (remaining.length > 2) {
    parts.unshift(remaining.slice(-2));
    remaining = remaining.slice(0, -2);
  }
  if (remaining) parts.unshift(remaining);
  return '৳' + parts.join(',') + ',' + last3;
}
