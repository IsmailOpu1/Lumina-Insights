import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRefreshOnSave } from '@/context/FABContext';
import { useFilter } from '@/context/FilterContext';
import { useAuth } from '@/context/AuthContext';
import AddProductModal, { ProductToEdit } from '@/components/AddProductModal';
import SkeletonLoader from '@/components/SkeletonLoader';
import EmptyState from '@/components/EmptyState';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Download, Pencil, Trash2, ChevronUp, ChevronDown, Package, Loader2, Info, Plus, Boxes, AlertTriangle, PackageX, RefreshCw, Moon, PieChart } from 'lucide-react';
import PageHeader, { StatStrip } from '@/components/PageHeader';
import Pager from '@/components/Pager';
import Segmented from '@/components/dashboard/Segmented';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { exportXLSX, todaySuffix } from '@/lib/xlsxExport';
import { format as fnsFormat, subDays } from 'date-fns';
import { useCurrency } from '@/hooks/useCurrency';
import { dbErrorMessage } from '@/lib/dbErrors';
import { useExportGate } from '@/hooks/useExportGate';
import { useReadOnly } from '@/hooks/useReadOnly';

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
type StockFilter = 'all' | 'low' | 'out';

const PAGE_SIZE = 20;

export default function Inventory() {
  const { formatCurrency, symbol } = useCurrency();
  const canExport = useExportGate();
  const { getDateRange } = useFilter();
  const { ownerIdForQueries } = useAuth();
  const readOnly = useReadOnly();
  const [items, setItems] = useState<InvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
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
  const [soldRecently, setSoldRecently] = useState<Set<string>>(new Set());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: inv }, { data: settings }] = await Promise.all([
    supabase.from('inventory').select('*').order('product_name'),
    supabase.from('user_settings').select('dead_product_days').eq('user_id', ownerIdForQueries).maybeSingle()]
    );
    if (inv) setItems(inv as InvRow[]);
    const days = settings?.dead_product_days || 30;
    setDeadDays(days);

    // Sales metrics cover the selected period; "dead" products are judged on
    // their own window. Cancelled orders are not sales.
    const range = getDateRange();
    const [{ data: ordersData }, { data: recentSales }] = await Promise.all([
      supabase
        .from('orders')
        .select('product_id, quantity, selling_price')
        .neq('status', 'Cancelled')
        .not('product_id', 'is', null)
        .gte('date', fnsFormat(range.from, 'yyyy-MM-dd'))
        .lte('date', fnsFormat(range.to, 'yyyy-MM-dd')),
      supabase
        .from('orders')
        .select('product_id')
        .neq('status', 'Cancelled')
        .not('product_id', 'is', null)
        .gte('date', fnsFormat(subDays(new Date(), days), 'yyyy-MM-dd')),
    ]);

    if (ordersData) {
      const map: Record<string, {total_qty: number;total_revenue: number;}> = {};
      ordersData.forEach((o) => {
        const pid = o.product_id as string;
        if (!map[pid]) map[pid] = { total_qty: 0, total_revenue: 0 };
        map[pid].total_qty += o.quantity;
        map[pid].total_revenue += o.selling_price * o.quantity;
      });
      setOrderAggs(Object.entries(map).map(([product_id, v]) => ({ product_id, ...v })));
    }
    setSoldRecently(new Set((recentSales || []).map((o) => o.product_id as string)));
    setLoading(false);
  }, [getDateRange, ownerIdForQueries]);

  useEffect(() => {fetchAll();}, [fetchAll]);
  useRefreshOnSave('product', fetchAll);

  // Filtered
  const filtered = useMemo(() => {
    let list = items;
    if (stockFilter === 'out') list = list.filter((i) => i.stock_quantity === 0);
    if (stockFilter === 'low') list = list.filter((i) => i.stock_quantity > 0 && i.stock_quantity < i.low_stock_threshold);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((i) =>
    i.product_name.toLowerCase().includes(q) ||
    (i.sku || '').toLowerCase().includes(q)
    );
  }, [items, search, stockFilter]);

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
    if (error) toast.error('Failed to delete product', { description: dbErrorMessage(error.message) });else
    {toast.success('Product deleted');fetchAll();}
    setDeleteId(null);
  }

  function handleEdit(p: InvRow) {
    setEditProduct(p);
    setEditOpen(true);
  }

  async function handleExport() {
    if (!canExport()) return;
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
      await exportXLSX({ headers, rows, totalsRow: totals, filename: `Inventory_Export_${todaySuffix()}.xlsx` });
      toast.success('Export complete ✓');
    } catch {toast.error('Export failed');}
    setExporting(false);
  }

  // Metrics
  const totalProducts = items.length;
  const totalInvValue = items.reduce((s, i) => s + i.stock_quantity * i.cost_price, 0);
  const outCount = items.filter((i) => i.stock_quantity === 0).length;
  const lowStockCount = items.filter((i) => i.stock_quantity > 0 && i.stock_quantity < i.low_stock_threshold).length;

  // Turnover
  const totalSold = orderAggs.reduce((s, a) => s + a.total_qty, 0);
  const avgStock = items.length > 0 ? items.reduce((s, i) => s + i.stock_quantity, 0) / items.length : 1;
  const turnover = avgStock > 0 ? totalSold / avgStock : 0;

  // Dead products
  // No (non-cancelled) sale in the last `deadDays` days.
  const deadProducts = useMemo(
    () => items.filter((i) => !soldRecently.has(i.id)),
    [items, soldRecently]
  );

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
    if (pct > 60) return 'text-destructive';
    if (pct > 40) return 'text-warning';
    return 'text-success';
  }
  function riskBar(pct: number) {
    if (pct > 60) return 'bg-destructive';
    if (pct > 40) return 'bg-warning';
    return 'bg-success';
  }

  const th = (key: SortKey, label: string) => (
    <th className="sortable" onClick={() => toggleSort(key)} aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {label} <SortIcon col={key} />
    </th>
  );

  const insightTitle = 'flex items-center gap-2 text-sm font-medium text-foreground';

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Inventory"
        subtitle="Your products, what they cost, what they sell for and how much is left."
        actions={
          <>
            <Button variant="outline" onClick={handleExport} disabled={exporting || filtered.length === 0} className="max-sm:flex-1">
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {exporting ? 'Exporting...' : 'Export'}
            </Button>
            {!readOnly && (
              <Button onClick={() => {setEditProduct(null);setEditOpen(true);}} className="gap-1.5 shadow-glow max-sm:flex-1">
                <Plus size={16} />
                Add product
              </Button>
            )}
          </>
        }
      />

      <StatStrip
        stats={[
          { label: 'Products', value: totalProducts, icon: Boxes },
          { label: 'Stock value', value: formatCurrency(totalInvValue), icon: Package, hint: 'At cost price' },
          { label: 'Low stock', value: lowStockCount, icon: AlertTriangle, tone: lowStockCount ? 'warning' : undefined, hint: 'Below their threshold' },
          { label: 'Out of stock', value: outCount, icon: PackageX, tone: outCount ? 'negative' : undefined },
        ]}
      />

      {/* Insights */}
      {!loading && items.length > 0 &&
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="surface p-5">
            <p className={insightTitle}><RefreshCw size={15} className="text-primary" />Turnover</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{turnover.toFixed(1)}<span className="ml-1 text-base text-muted-foreground">x</span></p>
            <p className="mt-1 text-xs text-muted-foreground">Units sold for each unit you hold, over the Dashboard's date range</p>
          </div>

          <div className="surface p-5">
            <p className={insightTitle}><Moon size={15} className="text-warning" />Not selling <span className="font-normal text-muted-foreground">· no sales in {deadDays} days</span></p>
            {deadProducts.length === 0 ?
            <p className="mt-3 text-sm text-success">Every product sold recently</p> :
            <div className="mt-3 flex flex-wrap gap-1.5">
                {deadProducts.slice(0, 8).map((dp) =>
              <button key={dp.id} onClick={() => handleEdit(dp)} disabled={readOnly} className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning transition-colors hover:bg-warning/20 disabled:pointer-events-none">
                    {dp.product_name}
                  </button>
              )}
                {deadProducts.length > 8 && <span className="self-center text-xs text-muted-foreground">+{deadProducts.length - 8} more</span>}
              </div>
            }
          </div>

          <div className="surface p-5">
            <p className={insightTitle}>
              <PieChart size={15} className="text-highlight" />Dependency risk
              <Tooltip>
                <TooltipTrigger asChild><Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" /></TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs">Relying on a few products is risky. Aim for less than 40% of revenue from your top product.</TooltipContent>
              </Tooltip>
            </p>
            {orderAggs.length === 0 ?
            <p className="mt-3 text-sm text-muted-foreground">No sales in this period</p> :
            <div className="mt-3 space-y-3">
                {[
              { label: <>Top product <span className="text-foreground">{topProduct}</span></>, pct: topPct },
              { label: 'Top 3 products', pct: top3Pct }].
              map((r, idx) =>
              <div key={idx}>
                    <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{r.label}</span>
                      <span className={cn('font-medium tabular-nums', riskColor(r.pct))}>{r.pct.toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div className={cn('h-full rounded-full', riskBar(r.pct))} style={{ width: `${Math.min(100, r.pct)}%` }} />
                    </div>
                  </div>
              )}
              </div>
            }
          </div>
        </div>
      }

      <div className="surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative w-[280px] max-md:w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-9" placeholder="Search product or SKU..." value={search} onChange={(e) => {setSearch(e.target.value);setPage(1);}} />
          </div>
          <div className="flex-1" />
          <Segmented<StockFilter>
            label="Stock level"
            value={stockFilter}
            onChange={(v) => {setStockFilter(v);setPage(1);}}
            options={[
            { label: 'All', value: 'all' },
            { label: `Low${lowStockCount ? ` (${lowStockCount})` : ''}`, value: 'low' },
            { label: `Out${outCount ? ` (${outCount})` : ''}`, value: 'out' }]
            } />
        </div>

        {loading ?
        <div className="p-4"><SkeletonLoader variant="row" count={8} /></div> :
        filtered.length === 0 ?
        items.length === 0 ?
        <EmptyState icon={Package} title="No products yet" message="Add a product so orders can track stock and profit." actionLabel={readOnly ? undefined : 'Add product'} onAction={() => {setEditProduct(null);setEditOpen(true);}} /> :
        <EmptyState icon={Search} title="Nothing matches" message="Try a different search or stock filter." /> :

        <>
            <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="data-table min-w-[980px]">
                <thead>
                  <tr>
                    {th('product_name', 'Product')}
                    {th('stock_quantity', 'Stock')}
                    {th('cost_price', `Cost ${symbol}`)}
                    {th('selling_price', `Price ${symbol}`)}
                    <th>Margin</th>
                    {th('inv_value', `Value ${symbol}`)}
                    {th('supplier', 'Supplier')}
                    {!readOnly && <th className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((i) => {
                  const isOut = i.stock_quantity === 0;
                  const isLow = !isOut && i.stock_quantity < i.low_stock_threshold;
                  const fill = Math.min(100, i.stock_quantity / Math.max(1, i.low_stock_threshold * 2) * 100);
                  const margin = i.selling_price > 0 ? (i.selling_price - i.cost_price) / i.selling_price * 100 : 0;
                  return (
                    <tr key={i.id}>
                        <td>
                          <p className="font-medium">{i.product_name}</p>
                          {i.sku && <p className="text-xs text-muted-foreground">{i.sku}</p>}
                        </td>
                        <td className="min-w-[170px]">
                          <div className="flex items-center gap-2">
                            <span className={cn('w-8 tabular-nums font-medium', isOut ? 'text-destructive' : isLow ? 'text-warning' : '')}>{i.stock_quantity}</span>
                            <div className="h-1.5 w-16 rounded-full bg-muted" title={`Alert below ${i.low_stock_threshold}`}>
                              <div className={cn('h-full rounded-full', isOut ? 'bg-destructive' : isLow ? 'bg-warning' : 'bg-primary')} style={{ width: `${fill}%` }} />
                            </div>
                            {(isOut || isLow) &&
                          <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-medium', isOut ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning')}>
                                {isOut ? 'Out' : 'Low'}
                              </span>
                          }
                          </div>
                        </td>
                        <td className="tabular-nums text-muted-foreground">{formatCurrency(i.cost_price)}</td>
                        <td className="tabular-nums">{formatCurrency(i.selling_price)}</td>
                        <td className={cn('tabular-nums', margin < 0 ? 'text-destructive' : margin < 20 ? 'text-warning' : 'text-success')}>
                          {i.selling_price > 0 ? `${margin.toFixed(0)}%` : '—'}
                        </td>
                        <td className="tabular-nums">{formatCurrency(i.stock_quantity * i.cost_price)}</td>
                        <td className="text-muted-foreground">{i.supplier || '—'}</td>
                        {!readOnly && (
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handleEdit(i)} className="icon-btn" aria-label={`Edit ${i.product_name}`}>
                                <Pencil size={16} />
                              </button>
                              <button onClick={() => setDeleteId(i.id)} className="icon-btn-danger" aria-label={`Delete ${i.product_name}`}>
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

      {/* Edit Product Modal */}
      <AddProductModal
        editProduct={editProduct}
        externalOpen={editOpen}
        onClose={() => {setEditOpen(false);setEditProduct(null);}}
        onSaved={() => {setEditOpen(false);setEditProduct(null);fetchAll();}} />
      


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