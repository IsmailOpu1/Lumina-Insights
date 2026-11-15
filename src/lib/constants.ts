export const STATUS_COLORS: Record<string, string> = {
  Pending: '#F5A524',
  Processing: '#60A5FA',
  Shipped: '#5EEAD4',
  Delivered: '#34D399',
  Cancelled: '#F43F5E',
  Returned: '#FB923C',
};

export const SOURCES = ['Instagram', 'Facebook', 'WhatsApp', 'Website', 'TikTok'] as const;
export type Source = (typeof SOURCES)[number];

export const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Cancelled and returned orders are not sales and hold no stock. A returned
 * order still cost its delivery and ads, so it counts toward profit.
 */
export const NOT_SALES = ['Cancelled', 'Returned'] as const;
export const isSale = (status: string) => !(NOT_SALES as readonly string[]).includes(status);
export const holdsStock = isSale;
export const countsForProfit = (status: string) => status !== 'Cancelled';

export const EXPENSE_TYPES = ['Ad Spend', 'Shipping', 'Miscellaneous'] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const MARKETING_PLATFORMS = ['Facebook', 'Instagram', 'TikTok'] as const;

/** Longest business description, used by every AI feature to learn the business. */
export const DESCRIPTION_MAX = 1000;
/** What a useful business description covers; shown under the box. */
export const DESCRIPTION_HINT = 'Say what you sell, who buys it, your price range, where you sell, and how delivery and payment work. Our AI uses this to learn your business.';
