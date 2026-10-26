import { useNavigate } from 'react-router-dom';
import { CheckCircle2, PackageX, AlertTriangle } from 'lucide-react';
import SkeletonLoader from '@/components/SkeletonLoader';
import ChartCard from './ChartCard';

interface InventoryItem {
  id: string;
  product_name: string;
  stock_quantity: number;
  low_stock_threshold: number;
}

interface Props {
  items: InventoryItem[];
  loading: boolean;
}

export default function InventoryAlerts({ items, loading }: Props) {
  const navigate = useNavigate();
  if (loading) return <SkeletonLoader variant="row" count={4} />;

  const lowStock = items
    .filter((i) => i.stock_quantity < i.low_stock_threshold)
    .sort((a, b) => a.stock_quantity - b.stock_quantity);

  return (
    <ChartCard
      title="Stock alerts"
      subtitle={lowStock.length ? `${lowStock.length} product${lowStock.length === 1 ? '' : 's'} below threshold` : 'Products below their threshold'}
      action={lowStock.length > 0 && (
        <button onClick={() => navigate('/inventory')} className="text-xs font-medium text-primary hover:underline">
          Restock
        </button>
      )}
    >
      {lowStock.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 size={20} />
          </span>
          <p className="text-sm text-muted-foreground">Everything is well stocked</p>
        </div>
      ) : (
        <ul className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
          {lowStock.map((item) => {
            const out = item.stock_quantity === 0;
            const Icon = out ? PackageX : AlertTriangle;
            return (
              <li key={item.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <span className={out ? 'text-destructive' : 'text-warning'}><Icon size={16} /></span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.product_name}</span>
                <span className={`shrink-0 text-xs tabular-nums ${out ? 'text-destructive' : 'text-warning'}`}>
                  {out ? 'Out of stock' : `${item.stock_quantity} left`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}
