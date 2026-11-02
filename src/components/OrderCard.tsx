import type { ReactNode } from 'react';
import { format } from 'date-fns';
import StatusBadge from '@/components/StatusBadge';
import { useCurrency } from '@/hooks/useCurrency';
import { currentDateLocale, useT } from '@/i18n';
import { parseDay } from '@/lib/dates';
import { cn } from '@/lib/utils';

interface Props {
  orderNumber: string;
  customer: string;
  phone?: string | null;
  product: string;
  source: string | null;
  status: string;
  quantity: number;
  price: number;
  shipping: number;
  profit: number;
  date: string;
  actions?: ReactNode;
}

/** One order as a card, for phones, where the orders table would need sideways scrolling. */
export default function OrderCard({ orderNumber, customer, phone, product, source, status, quantity, price, shipping, profit, date, actions }: Props) {
  const { t } = useT();
  const { formatCurrency } = useCurrency();
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{customer}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[orderNumber, phone].filter(Boolean).join(' · ')} · {format(parseDay(date), 'dd MMM yyyy', { locale: currentDateLocale() })}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-1 text-sm">
          <p className="truncate text-muted-foreground">{product || '—'} × {quantity}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {source && <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5">{source}</span>}
            <span className="tabular-nums">{t('Price')} {formatCurrency(price)}</span>
            <span className="tabular-nums">{t('Shipping')} {formatCurrency(shipping)}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-muted-foreground">{t('Profit')}</p>
          <p className={cn('font-semibold tabular-nums', profit >= 0 ? 'text-success' : 'text-destructive')}>{formatCurrency(profit)}</p>
        </div>
      </div>
      {actions && <div className="mt-1 flex justify-end gap-1">{actions}</div>}
    </li>
  );
}
