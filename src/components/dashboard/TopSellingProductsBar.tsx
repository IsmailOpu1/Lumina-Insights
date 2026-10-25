import SkeletonLoader from '@/components/SkeletonLoader';
import { useCurrency } from '@/hooks/useCurrency';
import ChartCard from './ChartCard';

interface ProductData {
  name: string;
  qty: number;
  revenue: number;
}

interface Props {
  data: ProductData[];
  loading: boolean;
}

/** Ranked list with bars sized against the best seller. */
export default function TopSellingProductsBar({ data, loading }: Props) {
  const { formatCurrency } = useCurrency();
  if (loading) return <SkeletonLoader variant="chart" />;

  const top = data.slice(0, 6);
  const max = Math.max(1, ...top.map((d) => d.qty));

  return (
    <ChartCard title="Top products" subtitle="By units sold">
      {top.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No sales in this period yet</p>
      ) : (
        <ol className="space-y-3.5">
          {top.map((p, i) => (
            <li key={p.name}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="truncate font-medium text-foreground" title={p.name}>{p.name}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {p.qty} sold · {formatCurrency(p.revenue)}
                </span>
              </div>
              <div className="ml-6 h-1.5 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-gradient-to-r from-primary to-highlight"
                  style={{ width: `${(p.qty / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </ChartCard>
  );
}
