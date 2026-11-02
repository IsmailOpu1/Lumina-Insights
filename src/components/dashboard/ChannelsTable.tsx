import SkeletonLoader from '@/components/SkeletonLoader';
import { useCurrency } from '@/hooks/useCurrency';
import type { Channel } from '@/hooks/useDashboardData';
import { cn } from '@/lib/utils';
import ChartCard from './ChartCard';
import { useT } from '@/i18n';

interface Props {
  data: Channel[];
  loading: boolean;
}

/** A cancel and return rate at or above this is shown in red; half of it in amber. */
const HIGH_LOSS = 20;
/** A source needs this many orders before it is named best or worst. */
const MIN_ORDERS = 5;

/**
 * Each source's orders, cancels and returns, and what it earned after them,
 * so ad money goes where orders actually turn into profit.
 */
export default function ChannelsTable({ data, loading }: Props) {
  const { t } = useT();
  const { formatCurrency } = useCurrency();
  if (loading) return <SkeletonLoader variant="chart" />;

  const judged = data.filter((c) => c.orders >= MIN_ORDERS);
  const best = judged.length > 1 ? judged[0] : null;
  const worst = [...judged].sort((a, b) => b.lostRate - a.lostRate)[0];
  const name = (source: string) => (source === 'Unknown' ? t('Unknown') : source);

  return (
    <ChartCard title={t('Channels')} subtitle={t('Where orders come from, and what each earns after cancels and returns')} className="mb-6">
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t('No orders in this period yet')}</p>
      ) : (
        <>
          {(best || (worst && worst.lostRate >= HIGH_LOSS)) && (
            <ul className="mb-4 space-y-1 text-sm">
              {best && best.profit > 0 && (
                <li className="text-foreground">
                  {t('{source} earns you the most after cancels and returns.', { source: name(best.source) })}
                </li>
              )}
              {worst && worst.lostRate >= HIGH_LOSS && (
                <li className="text-destructive">
                  {t('{source}: {pct}% of orders are cancelled or returned.', { source: name(worst.source), pct: Math.round(worst.lostRate) })}
                </li>
              )}
            </ul>
          )}
          <div className="-mx-5 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('Source')}</th>
                  <th className="text-right">{t('Orders')}</th>
                  <th className="text-right">{t('Cancelled or returned')}</th>
                  <th className="text-right max-sm:hidden">{t('Revenue')}</th>
                  <th className="text-right">{t('Profit')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.source}>
                    <td className="font-medium">{name(c.source)}</td>
                    <td className="text-right tabular-nums">{c.orders}</td>
                    <td className={cn(
                      'text-right tabular-nums',
                      c.lostRate >= HIGH_LOSS ? 'text-destructive' : c.lostRate >= HIGH_LOSS / 2 ? 'text-warning' : 'text-muted-foreground'
                    )}>
                      {Math.round(c.lostRate)}%
                      <span className="ml-1 text-xs text-muted-foreground">({c.cancelled + c.returned})</span>
                    </td>
                    <td className="text-right tabular-nums max-sm:hidden">{formatCurrency(c.revenue)}</td>
                    <td className={cn('text-right font-medium tabular-nums', c.profit < 0 ? 'text-destructive' : 'text-foreground')}>
                      {formatCurrency(c.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ChartCard>
  );
}
