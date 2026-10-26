import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRefreshOnSave } from '@/context/FABContext';
import { inDayFilter, parseDay, type DayFilter } from '@/lib/dates';
import { useReadOnly } from '@/hooks/useReadOnly';
import { ORDER_STATUSES } from '@/lib/constants';
import StatusBadge from '@/components/StatusBadge';
import AddOrderModal, { OrderToEdit } from '@/components/AddOrderModal';
import SkeletonLoader from '@/components/SkeletonLoader';
import EmptyState from '@/components/EmptyState';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, Download, Pencil, Trash2, ChevronUp, ChevronDown, ShoppingBag, Loader2, Plus, Wallet, TrendingUp, Receipt } from 'lucide-react';
import PageHeader, { StatStrip } from '@/components/PageHeader';
import Pager from '@/components/Pager';
import Segmented from '@/components/dashboard/Segmented';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { exportXLSX, todaySuffix } from '@/lib/xlsxExport';
import { format as fnsFormat } from 'date-fns';
import { useCurrency } from '@/hooks/useCurrency';
import { useExportGate } from '@/hooks/useExportGate';

interface OrderRow {
  id: string;
  order_number: string;
  customer_name: string;
  product_id: string | null;
  source: string | null;
  status: string;
  quantity: number;
  selling_price: number;
  unit_cost: number;
  shipping_cost: number;
  ad_cost: number;
  profit_per_order: number | null;
  date: string;
  product_name: string | null;
  inventory?: {product_name: string;} | null;
}

type SortKey = 'order_number' | 'customer_name' | 'product' | 'source' | 'status' | 'quantity' | 'selling_price' | 'shipping_cost' | 'profit_per_order' | 'date';
type SortDir = 'asc' | 'desc';
type DateFilter = DayFilter;

const PAGE_SIZE = 20;

const DATE_OPTIONS: { label: string; value: DateFilter }[] = [
  { label: 'Today', value: 'today' },
  { label: '7 days', value: '7days' },
  { label: '30 days', value: '30days' },
  { label: 'All time', value: 'custom' },
];

export default function Orders() {
  const { formatCurrency, symbol } = useCurrency();
  const canExport = useExportGate();
  const readOnly = useReadOnly();
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
  useRefreshOnSave('order', fetchOrders);

  const filtered = useMemo(() => {
    let list = orders.filter((o) => inDayFilter(o.date, dateFilter));
    if (statusFilter !== 'all') list = list.filter((o) => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) =>
      o.customer_name.toLowerCase().includes(q) ||
      o.order_number.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, dateFilter, statusFilter, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      switch (sortKey) {
        case 'order_number':va = a.order_number;vb = b.order_number;break;
        case 'customer_name':va = a.customer_name;vb = b.customer_name;break;
        case 'product':va = (a.inventory?.product_name ?? a.product_name) || '';vb = (b.inventory?.product_name ?? b.product_name) || '';break;
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
      product_name: o.inventory?.product_name ?? o.product_name,
      quantity: o.quantity,
      selling_price: o.selling_price,
      unit_cost: o.unit_cost,
      shipping_cost: o.shipping_cost,
      ad_cost: o.ad_cost ?? 0,
      source: o.source,
      status: o.status,
      date: o.date
    });
    setEditOpen(true);
  }

  async function handleExport() {
    if (!canExport()) return;
    setExporting(true);
    try {
      const headers = ['Order #', 'Customer', 'Product', 'Source', 'Status', 'Qty', 'Selling Price', 'Shipping', 'Ad Cost', 'Profit', 'Date'];
      const rows = filtered.map((o) => [
      o.order_number,
      o.customer_name,
      (o.inventory?.product_name ?? o.product_name) || '',
      o.source || '',
      o.status,
      o.quantity,
      o.selling_price,
      o.shipping_cost,
      o.ad_cost ?? 0,
      o.profit_per_order ?? 0,
      fnsFormat(parseDay(o.date), 'dd/MM/yyyy')]
      );
      const totals = ['TOTALS', '', '', '', '', '',
      filtered.reduce((s, o) => s + o.selling_price, 0),
      filtered.reduce((s, o) => s + o.shipping_cost, 0),
      filtered.reduce((s, o) => s + (o.ad_cost ?? 0), 0),
      filtered.reduce((s, o) => s + (o.profit_per_order ?? 0), 0),
      ''];

      await exportXLSX({ headers, rows, totalsRow: totals, filename: `Orders_Export_${todaySuffix()}.xlsx` });
      toast.success('Export complete ✓');
    } catch {toast.error('Export failed');}
    setExporting(false);
  }

  const totals = useMemo(() => {
    const live = filtered.filter((o) => o.status !== 'Cancelled');
    const revenue = live.reduce((s, o) => s + o.selling_price, 0);
    const profit = live.reduce((s, o) => s + (o.profit_per_order ?? 0), 0);
    return { revenue, profit, avg: live.length ? revenue / live.length : 0, pending: filtered.filter((o) => o.status === 'Pending').length };
  }, [filtered]);

  const th = (key: SortKey, label: string) => (
    <th className="sortable" onClick={() => toggleSort(key)} aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {label} <SortIcon col={key} />
    </th>
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Orders"
        subtitle="Every sale from every channel, with profit worked out per order."
        actions={
          <>
            <Button variant="outline" onClick={handleExport} disabled={exporting || filtered.length === 0} className="max-sm:flex-1">
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {exporting ? 'Exporting...' : 'Export'}
            </Button>
            {!readOnly && (
              <Button className="gap-1.5 shadow-glow max-sm:flex-1" onClick={() => setAddOpen(true)}>
                <Plus size={16} />
                Add order
              </Button>
            )}
          </>
        }
      />

      <StatStrip
        stats={[
          { label: 'Orders', value: filtered.length, icon: ShoppingBag, hint: totals.pending ? `${totals.pending} pending` : 'None pending' },
          { label: 'Revenue', value: formatCurrency(totals.revenue), icon: Wallet, hint: 'Cancelled orders excluded' },
          { label: 'Profit', value: formatCurrency(totals.profit), icon: TrendingUp, tone: totals.profit >= 0 ? 'positive' : 'negative' },
          { label: 'Average order', value: formatCurrency(totals.avg), icon: Receipt },
        ]}
      />

      <div className="surface overflow-hidden">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative w-[280px] max-md:w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-9" placeholder="Search customer or order #..." value={search} onChange={(e) => {setSearch(e.target.value);setPage(1);}} />
          </div>
          <Select value={statusFilter} onValueChange={(v) => {setStatusFilter(v);setPage(1);}}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Segmented<DateFilter> label="Date range" value={dateFilter} onChange={(v) => {setDateFilter(v);setPage(1);}} options={DATE_OPTIONS} />
        </div>

        {loading ?
        <div className="p-4"><SkeletonLoader variant="row" count={8} /></div> :
        filtered.length === 0 ?
        orders.length === 0 ?
        <EmptyState icon={ShoppingBag} title="No orders yet" message="Add your first order and Lumina works out the profit for you." actionLabel={readOnly ? undefined : 'Add order'} onAction={() => setAddOpen(true)} /> :
        <EmptyState icon={Search} title="No matching orders" message="Try a different search, status or date range." /> :

        <>
            <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="data-table min-w-[960px]">
                <thead>
                  <tr>
                    {th('order_number', 'Order #')}
                    {th('customer_name', 'Customer')}
                    {th('product', 'Product')}
                    {th('source', 'Source')}
                    {th('status', 'Status')}
                    {th('quantity', 'Qty')}
                    {th('selling_price', `Price ${symbol}`)}
                    {th('shipping_cost', `Shipping ${symbol}`)}
                    {th('profit_per_order', `Profit ${symbol}`)}
                    {th('date', 'Date')}
                    {!readOnly && <th className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((o) => {
                  const profit = o.profit_per_order ?? 0;
                  return (
                    <tr key={o.id}>
                        <td className="font-medium">{o.order_number}</td>
                        <td>{o.customer_name}</td>
                        <td className="text-muted-foreground">{(o.inventory?.product_name ?? o.product_name) || '—'}</td>
                        <td>
                          {o.source ?
                        <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">{o.source}</span> :
                        <span className="text-muted-foreground">—</span>}
                        </td>
                        <td><StatusBadge status={o.status} /></td>
                        <td className="tabular-nums">{o.quantity}</td>
                        <td className="tabular-nums">{formatCurrency(o.selling_price)}</td>
                        <td className="tabular-nums text-muted-foreground">{formatCurrency(o.shipping_cost)}</td>
                        <td className={cn('font-medium tabular-nums', profit >= 0 ? 'text-success' : 'text-destructive')}>
                          {formatCurrency(profit)}
                        </td>
                        <td className="whitespace-nowrap tabular-nums text-muted-foreground">{fnsFormat(parseDay(o.date), 'dd MMM yyyy')}</td>
                        {!readOnly && (
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handleEdit(o)} className="icon-btn" aria-label={`Edit order ${o.order_number}`}>
                                <Pencil size={16} />
                              </button>
                              <button onClick={() => setDeleteId(o.id)} className="icon-btn-danger" aria-label={`Delete order ${o.order_number}`}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>);

                })}
                </tbody>
              </table>
            </div>
            <Pager page={page} totalPages={totalPages} total={sorted.length} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        }
      </div>

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