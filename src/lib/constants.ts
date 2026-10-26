export const STATUS_COLORS: Record<string, string> = {
  Pending: '#F5A524',
  Processing: '#60A5FA',
  Shipped: '#5EEAD4',
  Delivered: '#34D399',
  Cancelled: '#F43F5E',
};

export const SOURCES = ['Instagram', 'Facebook', 'WhatsApp', 'Website', 'TikTok'] as const;
export type Source = (typeof SOURCES)[number];

export const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const EXPENSE_TYPES = ['Ad Spend', 'Shipping', 'Miscellaneous'] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const MARKETING_PLATFORMS = ['Facebook', 'Instagram', 'TikTok'] as const;
