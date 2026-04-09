import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { formatTaka } from '@/lib/constants';
import StatusBadge from '@/components/StatusBadge';
import SkeletonLoader from '@/components/SkeletonLoader';
import { format } from 'date-fns';

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  product_id: string | null;
  quantity: number;
  selling_price: number;
  shipping_cost: number;
  source: string;
  status: string;
  date: string;
  profit_per_order: number;
  created_at: string;
}

interface InventoryItem {
  id: string;
  product_name: string;
}

interface Props {
  orders: Order[];
  inventory: InventoryItem[];
  loading: boolean;
}

type SortKey = 'order_number' | 'customer_name' | 'source' | 'status' | 'quantity' | 'selling_price' | 'shipping_cost' | 'profit_per_order' | 'date';

export default function RecentOrdersTable({ orders, inventory, loading }: Props) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const invMap = useMemo(() => new Map(inventory.map((i) => [i.id, i.product_name])), [inventory]);

  const recent = useMemo(() => {
    const sorted = [...orders].sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va;
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return sorted.slice(0, 10);
  }, [orders, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);else
    {setSortKey(key);setSortAsc(true);}
  };

  const SortIcon = ({ k }: {k: SortKey;}) => {
    if (sortKey !== k) return null;
    return sortAsc ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />;
  };

  if (loading) return <SkeletonLoader variant="row" count={6} />;

  const headers: {label: string;key: SortKey;}[] = [
  { label: 'Order #', key: 'order_number' },
  { label: 'Customer', key: 'customer_name' },
  { label: 'Product', key: 'order_number' },
  { label: 'Source', key: 'source' },
  { label: 'Status', key: 'status' },
  { label: 'Qty', key: 'quantity' },
  { label: 'Price ৳', key: 'selling_price' },
  { label: 'Shipping ৳', key: 'shipping_cost' },
  { label: 'Profit ৳', key: 'profit_per_order' },
  { label: 'Date', key: 'date' }];


  return (
    <div className="card-hover mb-6 rounded-xl border border-border p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-[var(--chart-card-bg)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Recent Orders</h3>
        <button onClick={() => navigate('/orders')} className="text-sm font-bold text-primary hover:underline">
          View All →
        </button>
      </div>
      <div className="-mx-5 overflow-x-auto px-5" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-border">
              {headers.map((h) =>
              <th
                key={h.label}
                onClick={() => toggleSort(h.key)}
                className="cursor-pointer whitespace-nowrap px-3 py-2.5 text-left font-extrabold text-sm text-accent">
                
                  {h.label} <SortIcon k={h.key} />
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {recent.map((o) =>
            <tr key={o.id} className="table-row-hover border-b border-border/50">
                <td className="px-3 py-2.5 font-bold text-foreground">{o.order_number}</td>
                <td className="px-3 py-2.5 text-foreground font-extrabold text-sm">{o.customer_name}</td>
                <td className="px-3 py-2.5 font-extrabold text-indigo-900">{o.product_id ? invMap.get(o.product_id) || '—' : '—'}</td>
                <td className="px-3 py-2.5 font-extrabold text-indigo-900">{o.source}</td>
                <td className="px-3 py-2.5"><StatusBadge status={o.status} /></td>
                <td className="px-3 py-2.5 font-bold text-foreground">{o.quantity}</td>
                <td className="px-3 py-2.5 font-bold text-foreground">{formatTaka(o.selling_price)}</td>
                <td className="px-3 py-2.5 font-extrabold text-sm text-accent">{formatTaka(o.shipping_cost)}</td>
                <td className="px-3 py-2.5 text-[#07ab4c] font-extrabold" style={{ color: o.profit_per_order >= 0 ? '#10B981' : '#EF4444' }}>
                  {formatTaka(o.profit_per_order)}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground text-sm font-extrabold">{format(new Date(o.date), 'dd MMM')}</td>
              </tr>
            )}
            {recent.length === 0 &&
            <tr><td colSpan={10} className="px-3 py-8 text-center text-sm text-muted-foreground">No orders in this period</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>);

}