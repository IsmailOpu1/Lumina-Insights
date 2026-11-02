import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import { ChevronRight, Clock, PackageX, Truck, Undo2, type LucideIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from '@/lib/fetchAll';
import { findAttention, STUCK_DAYS, WAITING_DAYS, WINDOW_DAYS, type Attention, type AttentionOrder, type AttentionProduct } from '@/lib/attention';
import { useCurrency } from '@/hooks/useCurrency';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

interface Props {
  products: AttentionProduct[];
  /** Changes whenever the dashboard reloads, so this reloads with it. */
  reloadKey: unknown;
}

/**
 * Problems to act on today, above the numbers: orders stuck with the
 * courier or waiting to be sent, cancels and returns climbing, and products
 * about to run out. Hidden when there are none. Not tied to the date filter.
 */
export default function NeedsAttention({ products, reloadKey }: Props) {
  const { t } = useT();
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<AttentionOrder[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const since = format(subDays(new Date(), WINDOW_DAYS * 2), 'yyyy-MM-dd');
    // Stuck and waiting orders can be older than the window.
    const open = '("Pending","Processing","Shipped")';
    Promise.all([
      fetchAll((a, b) => supabase.from('orders').select('order_number, status, date, product_id, quantity, selling_price')
        .gte('date', since).order('id').range(a, b)),
      fetchAll((a, b) => supabase.from('orders').select('order_number, status, date, product_id, quantity, selling_price')
        .lt('date', since).filter('status', 'in', open).order('id').range(a, b)),
    ]).then(([recent, older]) => {
      if (cancelled || recent.error || older.error) return;
      setOrders([...(recent.data as AttentionOrder[]), ...(older.data as AttentionOrder[])]);
    });
    return () => { cancelled = true; };
  }, [reloadKey]);

  if (!orders) return null;
  const items = findAttention(orders, products);
  if (!items.length) return null;

  const view = (item: Attention): { icon: LucideIcon; danger: boolean; title: string; detail: string; to: string; action: string } => {
    switch (item.kind) {
      case 'stuck':
        return {
          icon: Truck, danger: true, to: '/orders?status=Shipped', action: t('See orders'),
          title: item.count === 1
            ? t('1 shipped order not delivered after {days} days', { days: STUCK_DAYS })
            : t('{n} shipped orders not delivered after {days} days', { n: item.count, days: STUCK_DAYS }),
          detail: t('{amount} cash on delivery at risk. Check with your courier.', { amount: formatCurrency(item.amount) }),
        };
      case 'waiting':
        return {
          icon: Clock, danger: false, to: '/orders?status=Pending', action: t('See orders'),
          title: item.count === 1
            ? t('1 order waiting over {days} days to be sent', { days: WAITING_DAYS })
            : t('{n} orders waiting over {days} days to be sent', { n: item.count, days: WAITING_DAYS }),
          detail: t('{amount} · the oldest is {days} days old', { amount: formatCurrency(item.amount), days: item.oldestDays }),
        };
      case 'returns':
        return {
          icon: Undo2, danger: true, to: '/orders', action: t('See orders'),
          title: t('Cancels and returns are {rate}% of orders', { rate: Math.round(item.rate) }),
          detail: item.previousRate !== null
            ? t('Up from {prev}% the month before · {bad} of {total} orders in the last 30 days', { prev: Math.round(item.previousRate), bad: item.bad, total: item.total })
            : t('{bad} of {total} orders in the last 30 days', { bad: item.bad, total: item.total }),
        };
      case 'runway':
        return {
          icon: PackageX, danger: false, to: '/inventory', action: t('Restock'),
          title: item.daysLeft === 1
            ? t('{name}: about 1 day of stock left', { name: item.name })
            : t('{name}: about {days} days of stock left', { name: item.name, days: item.daysLeft }),
          detail: t('{stock} left, selling about {n} a week', { stock: item.stock, n: item.perWeek }),
        };
      case 'soldOut':
        return {
          icon: PackageX, danger: true, to: '/inventory', action: t('Restock'),
          title: t('{name} is out of stock', { name: item.name }),
          detail: t('It sold {n} in the last 30 days', { n: item.sold }),
        };
    }
  };

  return (
    <section aria-labelledby="attention-title" className="mb-6">
      <h2 id="attention-title" className="eyebrow mb-2">{t('Needs your attention')}</h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((item) => {
          const v = view(item);
          const Icon = v.icon;
          return (
            <li key={item.kind + ('productId' in item ? item.productId : '')}>
              <button
                onClick={() => navigate(v.to)}
                className={cn(
                  'surface-interactive flex h-full w-full items-center gap-3 p-4 text-left',
                  v.danger ? 'border-destructive/30' : 'border-warning/30'
                )}
              >
                <span className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  v.danger ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'
                )}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{v.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{v.detail}</span>
                </span>
                <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary">
                  <span className="max-sm:hidden">{v.action}</span>
                  <ChevronRight size={14} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
