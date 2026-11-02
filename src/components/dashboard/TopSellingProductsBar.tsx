import { useState } from 'react';
import SkeletonLoader from '@/components/SkeletonLoader';
import { useCurrency } from '@/hooks/useCurrency';
import { cn } from '@/lib/utils';
import ChartCard from './ChartCard';
import Segmented from './Segmented';
import { msg, useT } from '@/i18n';

interface ProductData {
  name: string;
  qty: number;
  revenue: number;
  profit: number;
}

interface Props {
  data: ProductData[];
  loading: boolean;
}

type Rank = 'units' | 'profit';

const RANKS: { label: string; value: Rank }[] = [
  { label: msg('Units sold'), value: 'units' },
  { label: msg('Profit'), value: 'profit' },
];

/**
 * Ranked list with bars sized against the leader. "Profit" shows which
 * products actually earn: a cheap item can sell the most and earn little,
 * and returns can push one into a loss (red).
 */
export default function TopSellingProductsBar({ data, loading }: Props) {
  const { t } = useT();
  const { formatCurrency } = useCurrency();
  const [rank, setRank] = useState<Rank>('units');
  if (loading) return <SkeletonLoader variant="chart" />;

  const byProfit = rank === 'profit';
  const top = (byProfit
    ? [...data].sort((a, b) => b.profit - a.profit)
    : data.filter((d) => d.qty > 0).sort((a, b) => b.qty - a.qty)
  ).slice(0, 6);
  const size = (p: ProductData) => (byProfit ? Math.abs(p.profit) : p.qty);
  const max = Math.max(1, ...top.map(size));

  return (
    <ChartCard
      title={t('Top products')}
      subtitle={byProfit ? t('After product cost, delivery and order ads') : t('By units sold')}
      action={<Segmented<Rank> label={msg('Rank products by')} value={rank} onChange={setRank} options={RANKS} />}
    >
      {top.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t('No sales in this period yet')}</p>
      ) : (
        <ol className="space-y-3.5">
          {top.map((p, i) => {
            const loss = byProfit && p.profit < 0;
            const margin = p.revenue > 0 ? Math.round((p.profit / p.revenue) * 100) : null;
            return (
              <li key={p.name}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="truncate font-medium text-foreground" title={p.name}>{p.name}</span>
                  </span>
                  <span className={cn('shrink-0 text-xs tabular-nums', loss ? 'text-destructive' : 'text-muted-foreground')}>
                    {byProfit
                      ? margin === null
                        ? formatCurrency(p.profit)
                        : t('{amount} · {pct}% margin', { amount: formatCurrency(p.profit), pct: margin })
                      : t('{n} sold · {amount}', { n: p.qty, amount: formatCurrency(p.revenue) })}
                  </span>
                </div>
                <div className="ml-6 h-1.5 rounded-full bg-muted">
                  <div
                    className={cn('h-1.5 rounded-full', loss ? 'bg-destructive' : 'bg-gradient-to-r from-primary to-highlight')}
                    style={{ width: `${(size(p) / max) * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </ChartCard>
  );
}
