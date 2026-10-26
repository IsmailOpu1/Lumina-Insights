import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import SkeletonLoader from '@/components/SkeletonLoader';
import { format } from 'date-fns';
import { parseDay } from '@/lib/dates';
import { useCurrency } from '@/hooks/useCurrency';
import ChartCard from './ChartCard';

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  product_id: string | null;
  product_name?: string | null;
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

type SortKey = 'order_number' | 'customer_name' | 'product' | 'source' | 'status' | 'quantity' | 'selling_price' | 'shipping_cost' | 'profit_per_order' | 'date';

export default function RecentOrdersTable({ orders, inventory, loading }: Props) {
  const { formatCurrency, symbol } = useCurrency();
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const invMap = useMemo(() => new Map(inventory.map((i) => [i.id, i.product_name])), [inventory]);

  const recent = useMemo(() => {
    const sorted = [...orders].sort((a, b) => {
      const productName = (o: Order) => (o.product_id && invMap.get(o.product_id)) || o.product_name || '';
      const va = sortKey === 'product' ? productName(a) : a[sortKey] ?? '';
      const vb = sortKey === 'product' ? productName(b) : b[sortKey] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va;
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return sorted.slice(0, 10);
  }, [orders, sortKey, sortAsc, invMap]);

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
  { label: 'Product', key: 'product' },
  { label: 'Source', key: 'source' },
  { label: 'Status', key: 'status' },
  { label: 'Qty', key: 'quantity' },
  { label: `Price ${symbol}`, key: 'selling_price' },
  { label: `Shipping ${symbol}`, key: 'shipping_cost' },
  { label: `Profit ${symbol}`, key: 'profit_per_order' },
  { label: 'Date', key: 'date' }];


  return (
    <ChartCard
      title="Recent orders"
      subtitle="Latest 10, any date"
      className="mb-6"
      action={
        <button onClick={() => navigate('/orders')} className="text-xs font-medium text-primary hover:underline">
          View all
        </button>
      }
    >
      <div className="-mx-5 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-y border-border bg-muted/40">
              {headers.map((h) =>
              <th
                key={h.label}
                onClick={() => toggleSort(h.key)}
                className="cursor-pointer whitespace-nowrap px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
                  {h.label} <SortIcon k={h.key} />
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {recent.map((o) =>
            <tr key={o.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40">
                <td className="px-5 py-3 font-medium text-foreground">{o.order_number}</td>
                <td className="px-5 py-3 text-foreground">{o.customer_name}</td>
                <td className="px-5 py-3 text-muted-foreground">{(o.product_id && invMap.get(o.product_id)) || o.product_name || '—'}</td>
                <td className="px-5 py-3 text-muted-foreground">{o.source}</td>
                <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                <td className="px-5 py-3 tabular-nums text-foreground">{o.quantity}</td>
                <td className="px-5 py-3 tabular-nums text-foreground">{formatCurrency(o.selling_price)}</td>
                <td className="px-5 py-3 tabular-nums text-muted-foreground">{formatCurrency(o.shipping_cost)}</td>
                <td className={`px-5 py-3 font-medium tabular-nums ${o.profit_per_order >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(o.profit_per_order)}
                </td>
                <td className="px-5 py-3 text-muted-foreground">{format(parseDay(o.date), 'dd MMM')}</td>
              </tr>
            )}
            {recent.length === 0 &&
            <tr><td colSpan={10} className="px-5 py-10 text-center text-sm text-muted-foreground">No orders yet</td></tr>
            }
          </tbody>
        </table>
      </div>
    </ChartCard>);
}
