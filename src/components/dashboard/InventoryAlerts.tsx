import { AlertTriangle, CheckCircle } from 'lucide-react';
import SkeletonLoader from '@/components/SkeletonLoader';

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
  if (loading) return <SkeletonLoader variant="row" count={4} />;

  const lowStock = items.
  filter((i) => i.stock_quantity < i.low_stock_threshold).
  sort((a, b) => a.stock_quantity - b.stock_quantity);

  return (
    <div className="card-hover rounded-xl border border-border p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-[var(--chart-card-bg)]">
      <h3 className="mb-4 text-base text-foreground font-extrabold">⚠ Inventory Alerts</h3>
      <div className="max-h-[240px] space-y-2 overflow-y-auto">
        {lowStock.length === 0 ?
        <div className="flex items-center gap-2 py-4 font-extrabold text-base text-[#07ab4c]">
            <CheckCircle size={18} />
            All products are well stocked
          </div> :

        lowStock.map((item) =>
        <div
          key={item.id}
          className="flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-sm"
          style={{ borderLeftColor: item.stock_quantity === 0 ? '#EF4444' : '#F59E0B' }}>
          
              <AlertTriangle size={16} className={item.stock_quantity === 0 ? 'text-red-500' : 'text-amber-500'} />
              <span className="font-bold text-foreground">{item.product_name}</span>
              <span className="text-muted-foreground">— {item.stock_quantity} units remaining</span>
            </div>
        )
        }
      </div>
    </div>);

}