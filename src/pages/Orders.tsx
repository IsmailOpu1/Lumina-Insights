import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFAB } from '@/context/FABContext';
import { formatTaka, ORDER_STATUSES } from '@/lib/constants';
import StatusBadge from '@/components/StatusBadge';
import AddOrderModal, { OrderToEdit } from '@/components/AddOrderModal';
import SkeletonLoader from '@/components/SkeletonLoader';
import EmptyState from '@/components/EmptyState';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, Download, Pencil, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ShoppingBag, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { exportXLSX, todaySuffix } from '@/lib/xlsxExport';
import { format as fnsFormat, subDays, startOfDay, startOfToday } from 'date-fns';

interface OrderRow {
  id: string;
  order_number: string;
  customer_name: string;
  product_id: string;
  source: string | null;
  status: string;
  quantity: number;
  selling_price: number;
  shipping_cost: number;
  ad_cost: number;
  profit_per_order: number | null;
  date: string;
  inventory?: {product_name: string;} | null;
}

type SortKey = 'order_number' | 'customer_name' | 'product' | 'source' | 'status' | 'quantity' | 'selling_price' | 'shipping_cost' | 'profit_per_order' | 'date';
type SortDir = 'asc' | 'desc';
type DateFilter = 'today' | '7days' | '30days' | 'custom';

const PAGE_SIZE = 20;

export default function Orders() {
  const { openModal } = useFAB();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('30days');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const [editOrder, setEditOrder] = useState<OrderToEdit | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.
    from('orders').
    select('*, inventory!orders_product_id_fkey(product_name)').
    order('created_at', { ascending: false });
    if (error) {toast.error('Failed to load orders');console.error(error);} else
    setOrders(data as OrderRow[] || []);
    setLoading(false);
  }, []);

  useEffect(() => {fetchOrders();}, [fetchOrders]);

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (dateFilter) {
      case 'today':return { from: startOfToday(), to: now };
      case '7days':return { from: startOfDay(subDays(now, 7)), to: now };
      case '30days':return { from: startOfDay(subDays(now, 30)), to: now };
      default:return { from: startOfDay(subDays(now, 365)), to: now };
    }
  }, [dateFilter]);

  const filtered = useMemo(() => {
    let list = orders.filter((o) => {
      const d = new Date(o.date);
      return d >= dateRange.from && d <= dateRange.to;
    });
    if (statusFilter !== 'all') list = list.filter((o) => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) =>
      o.customer_name.toLowerCase().includes(q) ||
      o.order_number.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, dateRange, statusFilter, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      switch (sortKey) {
        case 'order_number':va = a.order_number;vb = b.order_number;break;
        case 'customer_name':va = a.customer_name;vb = b.customer_name;break;
        case 'product':va = a.inventory?.product_name || '';vb = b.inventory?.product_name || '';break;
        case 'source':va = a.source || '';vb = b.source || '';break;
        case 'status':va = a.status;vb = b.status;break;
        case 'quantity':va = a.quantity;vb = b.quantity;break;
        case 'selling_price':va = a.selling_price;vb = b.selling_price;break;
        case 'shipping_cost':va = a.shipping_cost;vb = b.shipping_cost;break;
        case 'profit_per_order':va = a.profit_per_order ?? 0;vb = b.profit_per_order ?? 0;break;
        case 'date':va = a.date;vb = b.date;break;
      }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');else
    {setSortKey(key);setSortDir('asc');}
    setPage(1);
  }

  function SortIcon({ col }: {col: SortKey;}) {
    if (sortKey !== col) return null;
    return sortDir === 'asc' ? <ChevronUp className="inline h-3.5 w-3.5" /> : <ChevronDown className="inline h-3.5 w-3.5" />;
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('orders').delete().eq('id', deleteId);
    if (error) toast.error('Failed to delete order');else
    {toast.success('Order deleted');fetchOrders();}
    setDeleteId(null);
  }

  function handleEdit(o: OrderRow) {
    setEditOrder({
      id: o.id,
      order_number: o.order_number,
      customer_name: o.customer_name,
      product_id: o.product_id,
      quantity: o.quantity,
      selling_price: o.selling_price,
      shipping_cost: o.shipping_cost,
      ad_cost: o.ad_cost ?? 0,
      source: o.source,
      status: o.status,
      date: o.date
    });
    setEditOpen(true);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const headers = ['Order #', 'Customer', 'Product', 'Source', 'Status', 'Qty', 'Selling Price', 'Shipping', 'Ad Cost', 'Profit', 'Date'];
      const rows = filtered.map((o) => [
      o.order_number,
      o.customer_name,
      o.inventory?.product_name || '',
      o.source || '',
      o.status,
      o.quantity,
      o.selling_price,
      o.shipping_cost,
      o.ad_cost ?? 0,
      o.profit_per_order ?? 0,
      fnsFormat(new Date(o.date), 'dd/MM/yyyy')]
      );
      const totals = ['TOTALS', '', '', '', '', '',
      filtered.reduce((s, o) => s + o.selling_price, 0),
      filtered.reduce((s, o) => s + o.shipping_cost, 0),
      filtered.reduce((s, o) => s + (o.ad_cost ?? 0), 0),
      filtered.reduce((s, o) => s + (o.profit_per_order ?? 0), 0),
      ''];

      exportXLSX({ headers, rows, totalsRow: totals, filename: `Orders_Export_${todaySuffix()}.xlsx` });
      toast.success('Export complete ✓');
    } catch {toast.error('Export failed');}
    setExporting(false);
  }

  const thClass = 'cursor-pointer select-none whitespace-nowrap px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors';

  return (
    <div>
      <h1 className="mb-5 text-[28px] font-bold text-pink-200">Orders</h1>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-[280px] max-md:w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search customer or order #..." value={search} onChange={(e) => {setSearch(e.target.value);setPage(1);}} />
        </div>
        <Select value={dateFilter} onValueChange={(v) => {setDateFilter(v as DateFilter);setPage(1);}}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7days">7 Days</SelectItem>
            <SelectItem value="30days">30 Days</SelectItem>
            <SelectItem value="custom">All Time</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => {setStatusFilter(v);setPage(1);}}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/5 font-extrabold" onClick={handleExport} disabled={exporting || filtered.length === 0}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {exporting ? 'Exporting...' : 'Export XLSX'}
        </Button>
        <Button className="h-11 gap-2 px-5 font-bold max-md:w-full" onClick={() => setAddOpen(true)}>
          <Plus size={18} />
          Add Order
        </Button>
      </div>

      {loading ?
      <SkeletonLoader variant="row" count={8} /> :
      filtered.length === 0 ?
      <EmptyState icon={ShoppingBag} title="No orders yet" message="Tap + to add your first order." actionLabel="Add Order" onAction={() => setAddOpen(true)} /> :

      <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className={thClass} onClick={() => toggleSort('order_number')}>Order # <SortIcon col="order_number" /></th>
                  <th className={thClass} onClick={() => toggleSort('customer_name')}>Customer <SortIcon col="customer_name" /></th>
                  <th className={thClass} onClick={() => toggleSort('product')}>Product <SortIcon col="product" /></th>
                  <th className={thClass} onClick={() => toggleSort('source')}>Source <SortIcon col="source" /></th>
                  <th className={thClass} onClick={() => toggleSort('status')}>Status <SortIcon col="status" /></th>
                  <th className={thClass} onClick={() => toggleSort('quantity')}>Qty <SortIcon col="quantity" /></th>
                  <th className={thClass} onClick={() => toggleSort('selling_price')}>Selling ৳ <SortIcon col="selling_price" /></th>
                  <th className={thClass} onClick={() => toggleSort('shipping_cost')}>Shipping ৳ <SortIcon col="shipping_cost" /></th>
                  <th className={thClass} onClick={() => toggleSort('profit_per_order')}>Profit ৳ <SortIcon col="profit_per_order" /></th>
                  <th className={thClass} onClick={() => toggleSort('date')}>Date <SortIcon col="date" /></th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((o) => {
                const profit = o.profit_per_order ?? 0;
                return (
                  <tr key={o.id} className="table-row-hover border-b border-border last:border-0">
                      <td className="px-3 py-2.5 bg-[var(--chart-card-bg)] font-extrabold font-sans">{o.order_number}</td>
                      <td className="px-3 py-2.5 bg-[var(--chart-card-bg)] font-extrabold font-sans">{o.customer_name}</td>
                      <td className="px-3 py-2.5 bg-[var(--chart-card-bg)] font-extrabold font-sans">{o.inventory?.product_name || '—'}</td>
                      <td className="px-3 py-2.5 border-[var(--chart-card-bg)] bg-[var(--chart-card-bg)] font-extrabold text-sm"><span className="font-extrabold text-sm text-orange-300">{o.source || '—'}</span></td>
                      <td className="px-3 py-2.5 bg-[var(--chart-card-bg)] font-extrabold"><StatusBadge status={o.status} /></td>
                      <td className="px-3 py-2.5 tabular-nums bg-[var(--chart-card-bg)] font-extrabold">{o.quantity}</td>
                      <td className="px-3 py-2.5 tabular-nums bg-[var(--chart-card-bg)] font-extrabold">{formatTaka(o.selling_price)}</td>
                      <td className="px-3 py-2.5 tabular-nums bg-[var(--chart-card-bg)] font-extrabold">{formatTaka(o.shipping_cost)}</td>
                      <td className={cn("px-3 py-2.5 tabular-nums bg-[var(--chart-card-bg)] font-extrabold", profit > 0 ? 'text-[#1bad0b]' : 'text-destructive')}>
                        {formatTaka(profit)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums bg-[var(--chart-card-bg)] font-extrabold">{fnsFormat(new Date(o.date), 'dd/MM/yyyy')}</td>
                      <td className="px-3 py-2.5 bg-[var(--chart-card-bg)]">
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleEdit(o)} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95">
                            <Pencil size={18} />
                          </button>
                          <button onClick={() => setDeleteId(o.id)} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 active:scale-95">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>);

              })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 &&
        <div className="mt-4 flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).
          filter((p) => Math.abs(p - page) <= 2 || p === 1 || p === totalPages).
          map((p, i, arr) => {
            const prev = arr[i - 1];
            const gap = prev && p - prev > 1;
            return (
              <span key={p}>
                      {gap && <span className="px-1 text-muted-foreground">…</span>}
                      <Button variant={page === p ? 'default' : 'outline'} size="sm" className={cn('min-w-[36px]', page === p && 'font-bold')} onClick={() => setPage(p)}>
                        {p}
                      </Button>
                    </span>);

          })}
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
        }
        </>
      }

      {/* Add Order Modal (button-triggered) */}
      <AddOrderModal
        externalOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {setAddOpen(false);fetchOrders();}} />
      

      {/* Edit Order Modal */}
      <AddOrderModal
        editOrder={editOrder}
        externalOpen={editOpen}
        onClose={() => {setEditOpen(false);setEditOrder(null);}}
        onSaved={() => {setEditOpen(false);setEditOrder(null);fetchOrders();}} />
      

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => {if (!open) setDeleteId(null);}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this order?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>);

}