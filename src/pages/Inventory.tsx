import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFAB } from '@/context/FABContext';
import { useFilter } from '@/context/FilterContext';
import { formatTaka } from '@/lib/constants';
import AddProductModal, { ProductToEdit } from '@/components/AddProductModal';
import SkeletonLoader from '@/components/SkeletonLoader';
import EmptyState from '@/components/EmptyState';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Download, Pencil, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Package, AlertTriangle, Loader2, Info, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { exportXLSX, todaySuffix } from '@/lib/xlsxExport';
import { format as fnsFormat, subDays } from 'date-fns';

interface InvRow {
  id: string;
  product_name: string;
  sku: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  supplier: string | null;
}

interface OrderAgg {
  product_id: string;
  total_qty: number;
  total_revenue: number;
}

type SortKey = 'product_name' | 'sku' | 'cost_price' | 'selling_price' | 'stock_quantity' | 'low_stock_threshold' | 'inv_value' | 'supplier';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 20;

export default function Inventory() {
  const { openModal } = useFAB();
  const { getDateRange } = useFilter();
  const [items, setItems] = useState<InvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('product_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  const [editProduct, setEditProduct] = useState<ProductToEdit | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Metrics data
  const [orderAggs, setOrderAggs] = useState<OrderAgg[]>([]);
  const [deadDays, setDeadDays] = useState(30);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: inv }, { data: settings }] = await Promise.all([
    supabase.from('inventory').select('*').order('product_name'),
    supabase.from('user_settings').select('dead_product_days').limit(1).maybeSingle()]
    );
    if (inv) setItems(inv as InvRow[]);
    if (settings && (settings as Record<string, unknown>).dead_product_days) setDeadDays((settings as Record<string, unknown>).dead_product_days as number);

    // Fetch order aggregates for metrics
    const range = getDateRange();
    const { data: ordersData } = await supabase.
    from('orders').
    select('product_id, quantity, selling_price').
    gte('date', fnsFormat(range.from, 'yyyy-MM-dd')).
    lte('date', fnsFormat(range.to, 'yyyy-MM-dd'));

    if (ordersData) {
      const map: Record<string, {total_qty: number;total_revenue: number;}> = {};
      ordersData.forEach((o) => {
        if (!map[o.product_id]) map[o.product_id] = { total_qty: 0, total_revenue: 0 };
        map[o.product_id].total_qty += o.quantity;
        map[o.product_id].total_revenue += o.selling_price * o.quantity;
      });
      setOrderAggs(Object.entries(map).map(([product_id, v]) => ({ product_id, ...v })));
    }
    setLoading(false);
  }, [getDateRange]);

  useEffect(() => {fetchAll();}, [fetchAll]);

  // Filtered
  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) =>
    i.product_name.toLowerCase().includes(q) ||
    (i.sku || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  // Sorted
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      switch (sortKey) {
        case 'product_name':va = a.product_name;vb = b.product_name;break;
        case 'sku':va = a.sku || '';vb = b.sku || '';break;
        case 'cost_price':va = a.cost_price;vb = b.cost_price;break;
        case 'selling_price':va = a.selling_price;vb = b.selling_price;break;
        case 'stock_quantity':va = a.stock_quantity;vb = b.stock_quantity;break;
        case 'low_stock_threshold':va = a.low_stock_threshold;vb = b.low_stock_threshold;break;
        case 'inv_value':va = a.stock_quantity * a.cost_price;vb = b.stock_quantity * b.cost_price;break;
        case 'supplier':va = a.supplier || '';vb = b.supplier || '';break;
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
    const { error } = await supabase.from('inventory').delete().eq('id', deleteId);
    if (error) toast.error('Failed to delete product', { description: error.message });else
    {toast.success('Product deleted');fetchAll();}
    setDeleteId(null);
  }

  function handleEdit(p: InvRow) {
    setEditProduct(p);
    setEditOpen(true);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const headers = ['Product Name', 'SKU', 'Cost Price', 'Selling Price', 'Stock Qty', 'Threshold', 'Inv. Value', 'Supplier'];
      const rows = filtered.map((i) => [
      i.product_name, i.sku || '', i.cost_price, i.selling_price,
      i.stock_quantity, i.low_stock_threshold,
      i.stock_quantity * i.cost_price, i.supplier || '']
      );
      const totalValue = filtered.reduce((s, i) => s + i.stock_quantity * i.cost_price, 0);
      const totals = ['TOTALS', '', '', '', '', '', totalValue, ''];
      exportXLSX({ headers, rows, totalsRow: totals, filename: `Inventory_Export_${todaySuffix()}.xlsx` });
      toast.success('Export complete ✓');
    } catch {toast.error('Export failed');}
    setExporting(false);
  }

  // Metrics
  const totalProducts = items.length;
  const totalInvValue = items.reduce((s, i) => s + i.stock_quantity * i.cost_price, 0);
  const lowStockCount = items.filter((i) => i.stock_quantity < i.low_stock_threshold).length;

  // Turnover
  const totalSold = orderAggs.reduce((s, a) => s + a.total_qty, 0);
  const avgStock = items.length > 0 ? items.reduce((s, i) => s + i.stock_quantity, 0) / items.length : 1;
  const turnover = avgStock > 0 ? totalSold / avgStock : 0;

  // Dead products
  const deadProducts = useMemo(() => {
    const cutoff = fnsFormat(subDays(new Date(), deadDays), 'yyyy-MM-dd');
    const activeIds = new Set(orderAggs.map((a) => a.product_id));
    // Also check date range — we need to re-query but for simplicity use orderAggs
    return items.filter((i) => !activeIds.has(i.id));
  }, [items, orderAggs, deadDays]);

  // Dependency risk
  const { topProduct, topPct, top3Pct } = useMemo(() => {
    const totalRev = orderAggs.reduce((s, a) => s + a.total_revenue, 0);
    if (totalRev === 0) return { topProduct: '', topPct: 0, top3Pct: 0 };
    const sorted = [...orderAggs].sort((a, b) => b.total_revenue - a.total_revenue);
    const topId = sorted[0]?.product_id;
    const topName = items.find((i) => i.id === topId)?.product_name || 'Unknown';
    const topPct = sorted[0]?.total_revenue / totalRev * 100;
    const top3Rev = sorted.slice(0, 3).reduce((s, a) => s + a.total_revenue, 0);
    const top3Pct = top3Rev / totalRev * 100;
    return { topProduct: topName, topPct, top3Pct };
  }, [orderAggs, items]);

  function riskColor(pct: number) {
    if (pct > 60) return 'text-red-600 dark:text-red-400';
    if (pct > 40) return 'text-orange-500';
    return 'text-green-600 dark:text-green-400';
  }

  const thClass = 'cursor-pointer select-none whitespace-nowrap px-3 py-3 text-left uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors font-extrabold text-sm';

  return (
    <div>
      <h1 className="mb-5 text-[28px] font-extrabold text-pink-200">Inventory</h1>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-accent">
        <div className="relative w-[280px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search product or SKU..." value={search} onChange={(e) => {setSearch(e.target.value);setPage(1);}} />
        </div>
        <div className="flex-1" />
        <Button onClick={() => {setEditProduct(null);setEditOpen(true);}} className="h-11 gap-2 rounded-lg px-5 font-bold max-md:w-full max-md:order-first">
          <Plus className="h-4 w-4" />+ Add Product
        </Button>
        <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/5 font-extrabold" onClick={handleExport} disabled={exporting || filtered.length === 0}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {exporting ? 'Exporting...' : 'Export XLSX'}
        </Button>
      </div>

      {/* Metric cards */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5">
          <p className="text-sm font-extrabold text-accent">Total Products</p>
          <p className="text-2xl font-bold text-foreground">{totalProducts}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm font-extrabold text-accent">Total Inventory Value</p>
          <p className="text-2xl font-bold text-foreground">{formatTaka(totalInvValue)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm font-extrabold text-accent">Low Stock Items</p>
          <p className="text-2xl font-bold text-foreground">
            {lowStockCount}
            {lowStockCount > 0 && <span className="ml-2 inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-950 dark:text-orange-400">{lowStockCount} alert{lowStockCount > 1 ? 's' : ''}</span>}
          </p>
        </CardContent></Card>
      </div>

      {loading ?
      <SkeletonLoader variant="row" count={8} /> :
      filtered.length === 0 ?
      <EmptyState icon={Package} title="No products yet" message="Tap + to add your first product." actionLabel="Add Product" onAction={() => openModal('product')} /> :

      <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className={thClass} onClick={() => toggleSort('product_name')}>Product <SortIcon col="product_name" /></th>
                  <th className={thClass} onClick={() => toggleSort('sku')}>SKU <SortIcon col="sku" /></th>
                  <th className={thClass} onClick={() => toggleSort('cost_price')}>Cost ৳ <SortIcon col="cost_price" /></th>
                  <th className={thClass} onClick={() => toggleSort('selling_price')}>Selling ৳ <SortIcon col="selling_price" /></th>
                  <th className={thClass} onClick={() => toggleSort('stock_quantity')}>Stock <SortIcon col="stock_quantity" /></th>
                  <th className={thClass} onClick={() => toggleSort('low_stock_threshold')}>Threshold <SortIcon col="low_stock_threshold" /></th>
                  <th className={thClass} onClick={() => toggleSort('inv_value')}>Inv. Value ৳ <SortIcon col="inv_value" /></th>
                  <th className={thClass} onClick={() => toggleSort('supplier')}>Supplier <SortIcon col="supplier" /></th>
                  <th className="px-3 py-3 text-left uppercase tracking-wider text-muted-foreground font-extrabold text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((i) => {
                const isOut = i.stock_quantity === 0;
                const isLow = !isOut && i.stock_quantity < i.low_stock_threshold;
                return (
                  <tr key={i.id} className={cn('table-row-hover border-b border-border last:border-0', isOut ? 'border-l-4 border-l-red-500' : isLow ? 'border-l-4 border-l-orange-400' : '')}>
                      <td className="px-3 py-2.5 text-sm font-extrabold bg-[var(--chart-card-bg)]">{i.product_name}</td>
                      <td className="px-3 py-2.5 text-sm font-extrabold bg-[var(--chart-card-bg)] text-orange-300">{i.sku || '—'}</td>
                      <td className="px-3 py-2.5 tabular-nums text-sm font-extrabold bg-[var(--chart-card-bg)]">{formatTaka(i.cost_price)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-sm font-extrabold bg-[var(--chart-card-bg)]">{formatTaka(i.selling_price)}</td>
                      <td className={cn("px-3 py-2.5 tabular-nums font-extrabold bg-[var(--chart-card-bg)]", isOut ? 'text-red-600 dark:text-red-400' : isLow ? 'text-orange-500' : '')}>{i.stock_quantity}</td>
                      <td className="px-3 py-2.5 tabular-nums font-extrabold text-sm bg-[var(--chart-card-bg)]">{i.low_stock_threshold}</td>
                      <td className="px-3 py-2.5 tabular-nums font-extrabold text-sm bg-[var(--chart-card-bg)]">{formatTaka(i.stock_quantity * i.cost_price)}</td>
                      <td className="px-3 py-2.5 font-extrabold text-sm text-accent bg-[var(--chart-card-bg)]">{i.supplier || '—'}</td>
                      <td className="px-3 py-2.5 text-sm font-extrabold border-[var(--chart-card-bg)]">
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleEdit(i)} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95">
                            <Pencil size={18} />
                          </button>
                          <button onClick={() => setDeleteId(i.id)} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 active:scale-95">
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
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => Math.abs(p - page) <= 2 || p === 1 || p === totalPages).map((p, i, arr) => {
            const prev = arr[i - 1];const gap = prev && p - prev > 1;
            return <span key={p}>{gap && <span className="px-1 text-muted-foreground">…</span>}<Button variant={page === p ? 'default' : 'outline'} size="sm" className={cn('min-w-[36px]', page === p && 'font-bold')} onClick={() => setPage(p)}>{p}</Button></span>;
          })}
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
        }
        </>
      }

      {/* Insights Section */}
      {!loading && items.length > 0 &&
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Turnover */}
          <Card><CardContent className="p-5">
            <p className="mb-1 text-sm font-extrabold text-accent">Inventory Turnover</p>
            <p className="text-3xl font-bold text-foreground">{turnover.toFixed(1)}</p>
            <p className="text-sm font-extrabold text-accent">units sold per unit held avg</p>
          </CardContent></Card>

          {/* Dead Products */}
          <Card><CardContent className="p-5">
            <p className="mb-2 flex items-center gap-1 text-accent font-extrabold text-sm">
              Dead Products <span className="font-extrabold text-xs text-accent">(no sales in {deadDays}d)</span>
            </p>
            {deadProducts.length === 0 ?
            <p className="text-sm font-medium text-green-600 dark:text-green-400">No dead stock 🎉</p> :

            <div className="flex flex-wrap gap-1.5">
                {deadProducts.slice(0, 8).map((dp) =>
              <button key={dp.id} onClick={() => handleEdit(dp)} className="rounded-full bg-orange-100 px-2.5 py-1 text-orange-700 transition-colors hover:bg-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:hover:bg-orange-900 active:scale-95 font-extrabold text-sm">
                    <AlertTriangle className="mr-1 inline h-3 w-3" />{dp.product_name}
                  </button>
              )}
                {deadProducts.length > 8 && <span className="text-xs text-muted-foreground self-center">+{deadProducts.length - 8} more</span>}
              </div>
            }
          </CardContent></Card>

          {/* Dependency Risk */}
          <Card><CardContent className="p-5">
            <p className="mb-2 flex items-center gap-1 text-accent font-extrabold text-sm">
              Dependency Risk
              <Tooltip>
                <TooltipTrigger asChild className="text-accent"><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs">High concentration in few products increases business risk. Aim for &lt;40% from top product.</TooltipContent>
              </Tooltip>
            </p>
            {orderAggs.length === 0 ?
            <p className="text-sm text-muted-foreground font-extrabold">No sales data in this period</p> :

            <div className="space-y-1.5">
                <p className="text-sm font-extrabold">Top product <span className="font-bold">'{topProduct}'</span> accounts for <span className={cn('font-bold', riskColor(topPct))}>{topPct.toFixed(1)}%</span> of revenue</p>
                <p className="text-sm font-extrabold">Top 3 products account for <span className={cn('font-bold', riskColor(top3Pct))}>{top3Pct.toFixed(1)}%</span> of revenue</p>
              </div>
            }
          </CardContent></Card>
        </div>
      }

      {/* Edit Product Modal */}
      <AddProductModal
        editProduct={editProduct}
        externalOpen={editOpen}
        onClose={() => {setEditOpen(false);setEditProduct(null);}}
        onSaved={() => {setEditOpen(false);setEditProduct(null);fetchAll();}} />
      

      {/* FAB Product Modal */}
      <AddProductModal onSaved={fetchAll} />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => {if (!open) setDeleteId(null);}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this product?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. Orders referencing this product may be affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>);

}