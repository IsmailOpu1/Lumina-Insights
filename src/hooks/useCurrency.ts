import { useAuth } from '@/context/AuthContext';

const CURRENCY_SYMBOLS: Record<string, string> = {
  BDT: '৳',
  INR: '₹',
  USD: '$',
};

export function formatCurrency(amount: number, currency: string = 'BDT'): string {
  const symbol = CURRENCY_SYMBOLS[currency] || '৳';
  if (amount < 0) return '-' + formatCurrency(-amount, currency);
  const str = Math.round(amount).toString();
  if (str.length <= 3) return symbol + str;

  // Bangladeshi-style grouping for BDT, standard for others
  if (currency === 'BDT' || currency === 'INR') {
    const last3 = str.slice(-3);
    let remaining = str.slice(0, -3);
    const parts: string[] = [];
    while (remaining.length > 2) {
      parts.unshift(remaining.slice(-2));
      remaining = remaining.slice(0, -2);
    }
    if (remaining) parts.unshift(remaining);
    return symbol + parts.join(',') + ',' + last3;
  }

  // Standard Western grouping for USD etc
  return symbol + Math.round(amount).toLocaleString('en-US');
}

export function useCurrency() {
  const { userSettings } = useAuth();
  const currency = userSettings?.currency || 'BDT';
  const symbol = CURRENCY_SYMBOLS[currency] || '৳';

  return {
    currency,
    symbol,
    formatCurrency: (amount: number) => formatCurrency(amount, currency),
  };
}
