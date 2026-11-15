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
import { fetchAll as fetchAllRows } from '@/lib/fetchAll';
import { useCachedState } from '@/lib/pageCache';
import { useReadOnly } from '@/hooks/useReadOnly';
import { msg, useT } from '@/i18n';

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

interface InventoryData {
  items: InvRow[];
  orderAggs: OrderAgg[];
  deadDays: number;
  soldRecently: Set<string>;
}

const NO_ITEMS: InvRow[] = [];
const NO_AGGS: OrderAgg[] = [];
const NO_SALES = new Set<string>();

export default function Inventory() {
  const { t } = useT();
  const { formatCurrency, symbol } = useCurrency();
  const canExport = useExportGate();
  const { getDateRange } = useFilter();
  const { ownerIdForQueries } = useAuth();
  const readOnly = useReadOnly();
  // Sales metrics depend on the period, so each period is remembered on its own.
  const period = getDateRange();
  const [data, setData] = useCachedState<InventoryData | null>(
    `inventory:${fnsFormat(period.from, 'yyyy-MM-dd')}:${fnsFormat(period.to, 'yyyy-MM-dd')}`, null);
  const loading = data === null;
  const items = data?.items ?? NO_ITEMS;
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
  const orderAggs = data?.orderAggs ?? NO_AGGS;
  const deadDays = data?.deadDays ?? 30;
  const soldRecently = data?.soldRecently ?? NO_SALES;

  const fetchAll = useCallback(async () => {
    const [{ data: inv }, { data: settings }] = await Promise.all([
    fetchAllRows((a, b) => supabase.from('inventory').select('*').order('product_name').order('id').range(a, b)),
    supabase.from('user_settings').select('dead_product_days').eq('user_id', ownerIdForQueries).maybeSingle()]
    );
    const days = settings?.dead_product_days || 30;

    // Sales metrics cover the selected period; "dead" products are judged on
    // their own window. Cancelled and returned orders are not sales.
    const range = getDateRange();
    const [{ data: ordersData }, { data: recentSales }] = await Promise.all([
      fetchAllRows((a, b) => supabase
        .from('orders')
        .select('product_id, quantity, selling_price')
        .not('status', 'in', '("Cancelled","Returned")')
        .not('product_id', 'is', null)
        .gte('date', fnsFormat(range.from, 'yyyy-MM-dd'))
        .lte('date', fnsFormat(range.to, 'yyyy-MM-dd'))
        .order('id')
        .range(a, b)),
      fetchAllRows((a, b) => supabase
        .from('orders')
        .select('product_id')
        .not('status', 'in', '("Cancelled","Returned")')
        .not('product_id', 'is', null)
        .gte('date', fnsFormat(subDays(new Date(), days), 'yyyy-MM-dd'))
        .order('id')
        .range(a, b)),
    ]);

    let orderAggs: OrderAgg[] = [];
    if (ordersData) {
      const map: Record<string, {total_qty: number;total_revenue: number;}> = {};
      ordersData.forEach((o) => {
        const pid = o.product_id as string;
        if (!map[pid]) map[pid] = { total_qty: 0, total_revenue: 0 };
        map[pid].total_qty += o.quantity;
        map[pid].total_revenue += o.selling_price * o.quantity;
      });
      orderAggs = Object.entries(map).map(([product_id, v]) => ({ product_id, ...v }));
    }
    setData({
      items: (inv as InvRow[]) || [],
      orderAggs,
      deadDays: days,
      soldRecently: new Set((recentSales || []).map((o) => o.product_id as string)),
    });
  }, [getDateRange, ownerIdForQueries, setData]);

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
    if (error) toast.error(t('Failed to delete product'), { description: dbErrorMessage(error.message) });else
    {toast.success(t('Product deleted'));fetchAll();}
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
      toast.success(t('Export complete ✓'));
    } catch {toast.error(t('Export failed'));}
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
  // No sale in the last `deadDays` days.
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
    const topName = items.find((i) => i.id === topId)?.product_name || t('Unknown');
    const topPct = sorted[0]?.total_revenue / totalRev * 100;
    const top3Rev = sorted.slice(0, 3).reduce((s, a) => s + a.total_revenue, 0);
    const top3Pct = top3Rev / totalRev * 100;
    return { topProduct: topName, topPct, top3Pct };
  }, [orderAggs, items, t]);

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
        title={t('Inventory')}
        subtitle={t('Your products, what they cost, what they sell for and how much is left.')}
        actions={
          <>
            <Button variant="outline" onClick={handleExport} disabled={exporting || filtered.length === 0} className="max-sm:flex-1">
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {exporting ? t('Exporting...') : t('Export')}
            </Button>
            {!readOnly && (
              <Button onClick={() => {setEditProduct(null);setEditOpen(true);}} className="gap-1.5 shadow-glow max-sm:flex-1">
                <Plus size={16} />
                {t('Add product')}
              </Button>
            )}
          </>
        }
      />

      <StatStrip
        stats={[
          { label: t('Products'), value: totalProducts, icon: Boxes },
          { label: t('Stock value'), value: formatCurrency(totalInvValue), icon: Package, hint: t('At cost price') },
          { label: t('Low stock'), value: lowStockCount, icon: AlertTriangle, tone: lowStockCount ? 'warning' : undefined, hint: t('Below their threshold') },
          { label: t('Out of stock'), value: outCount, icon: PackageX, tone: outCount ? 'negative' : undefined },
        ]}
      />

      {/* Insights */}
      {!loading && items.length > 0 &&
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="surface p-5">
            <p className={insightTitle}><RefreshCw size={15} className="text-primary" />{t('Turnover')}</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{turnover.toFixed(1)}<span className="ml-1 text-base text-muted-foreground">x</span></p>
            <p className="mt-1 text-xs text-muted-foreground">{t("Units sold for each unit you hold, over the Dashboard's date range")}</p>
          </div>

          <div className="surface p-5">
            <p className={insightTitle}><Moon size={15} className="text-warning" />{t('Not selling')} <span className="font-normal text-muted-foreground">· {t('no sales in {n} days', { n: deadDays })}</span></p>
            {deadProducts.length === 0 ?
            <p className="mt-3 text-sm text-success">{t('Every product sold recently')}</p> :
            <div className="mt-3 flex flex-wrap gap-1.5">
                {deadProducts.slice(0, 8).map((dp) =>
              <button key={dp.id} onClick={() => handleEdit(dp)} disabled={readOnly} className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning transition-colors hover:bg-warning/20 disabled:pointer-events-none">
                    {dp.product_name}
                  </button>
              )}
                {deadProducts.length > 8 && <span className="self-center text-xs text-muted-foreground">{t('+{n} more', { n: deadProducts.length - 8 })}</span>}
              </div>
            }
          </div>

          <div className="surface p-5">
            <p className={insightTitle}>
              <PieChart size={15} className="text-highlight" />{t('Dependency risk')}
              <Tooltip>
                <TooltipTrigger asChild><Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" /></TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs">{t('Relying on a few products is risky. Aim for less than 40% of revenue from your top product.')}</TooltipContent>
              </Tooltip>
            </p>
            {orderAggs.length === 0 ?
            <p className="mt-3 text-sm text-muted-foreground">{t('No sales in this period')}</p> :
            <div className="mt-3 space-y-3">
                {[
              { label: <>{t('Top product')} <span className="text-foreground">{topProduct}</span></>, pct: topPct },
              { label: t('Top 3 products'), pct: top3Pct }].
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
            <Input className="h-9 pl-9" placeholder={t('Search product or SKU...')} value={search} onChange={(e) => {setSearch(e.target.value);setPage(1);}} />
          </div>
          <div className="flex-1" />
          <Segmented<StockFilter>
            label={msg('Stock level')}
            value={stockFilter}
            onChange={(v) => {setStockFilter(v);setPage(1);}}
            options={[
            { label: msg('All'), value: 'all' },
            { label: lowStockCount ? t('Low ({n})', { n: lowStockCount }) : t('Low'), value: 'low' },
            { label: outCount ? t('Out ({n})', { n: outCount }) : t('Out'), value: 'out' }]
            } />
        </div>

        {loading ?
        <div className="p-4"><SkeletonLoader variant="row" count={8} /></div> :
        filtered.length === 0 ?
        items.length === 0 ?
        <EmptyState icon={Package} title={t('No products yet')} message={t('Add a product so orders can track stock and profit.')} actionLabel={readOnly ? undefined : t('Add product')} onAction={() => {setEditProduct(null);setEditOpen(true);}} /> :
        <EmptyState icon={Search} title={t('Nothing matches')} message={t('Try a different search or stock filter.')} /> :

        <>
            {/* Phones get cards; the table would need sideways scrolling. */}
            <ul className="divide-y divide-border md:hidden">
              {paged.map((i) => {
              const isOut = i.stock_quantity === 0;
              const isLow = !isOut && i.stock_quantity < i.low_stock_threshold;
              const fill = Math.min(100, i.stock_quantity / Math.max(1, i.low_stock_threshold * 2) * 100);
              const margin = i.selling_price > 0 ? (i.selling_price - i.cost_price) / i.selling_price * 100 : 0;
              return (
                <li key={i.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{i.product_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{[i.sku, i.supplier].filter(Boolean).join(' · ') || '—'}</p>
                      </div>
                      {!readOnly &&
                    <div className="-mr-2 -mt-1 flex shrink-0 gap-1">
                          <button onClick={() => handleEdit(i)} className="icon-btn" aria-label={t('Edit {name}', { name: i.product_name })}>
                            <Pencil size={16} />
                          </button>
                          <button onClick={() => setDeleteId(i.id)} className="icon-btn-danger" aria-label={t('Delete {name}', { name: i.product_name })}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                    }
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t('Stock')}</span>
                      <span className={cn('tabular-nums font-medium', isOut ? 'text-destructive' : isLow ? 'text-warning' : '')}>{i.stock_quantity}</span>
                      <div className="h-1.5 w-16 rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', isOut ? 'bg-destructive' : isLow ? 'bg-warning' : 'bg-primary')} style={{ width: `${fill}%` }} />
                      </div>
                      {(isOut || isLow) &&
                    <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-medium', isOut ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning')}>
                          {isOut ? t('Out') : t('Low')}
                        </span>
                    }
                    </div>
                    <dl className="mt-2 grid grid-cols-4 gap-2 text-xs">
                      <div><dt className="text-muted-foreground">{t('Cost')}</dt><dd className="tabular-nums">{formatCurrency(i.cost_price)}</dd></div>
                      <div><dt className="text-muted-foreground">{t('Price')}</dt><dd className="tabular-nums">{formatCurrency(i.selling_price)}</dd></div>
                      <div>
                        <dt className="text-muted-foreground">{t('Margin')}</dt>
                        <dd className={cn('tabular-nums', margin < 0 ? 'text-destructive' : margin < 20 ? 'text-warning' : 'text-success')}>{i.selling_price > 0 ? `${margin.toFixed(0)}%` : '—'}</dd>
                      </div>
                      <div><dt className="text-muted-foreground">{t('Value')}</dt><dd className="tabular-nums">{formatCurrency(i.stock_quantity * i.cost_price)}</dd></div>
                    </dl>
                  </li>);
            })}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="data-table min-w-[980px]">
                <thead>
                  <tr>
                    {th('product_name', t('Product'))}
                    {th('stock_quantity', t('Stock'))}
                    {th('cost_price', `${t('Cost')} ${symbol}`)}
                    {th('selling_price', `${t('Price')} ${symbol}`)}
                    <th>{t('Margin')}</th>
                    {th('inv_value', `${t('Value')} ${symbol}`)}
                    {th('supplier', t('Supplier'))}
                    {!readOnly && <th className="text-right">{t('Actions')}</th>}
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
                            <div className="h-1.5 w-16 rounded-full bg-muted" title={t('Alert below {n}', { n: i.low_stock_threshold })}>
                              <div className={cn('h-full rounded-full', isOut ? 'bg-destructive' : isLow ? 'bg-warning' : 'bg-primary')} style={{ width: `${fill}%` }} />
                            </div>
                            {(isOut || isLow) &&
                          <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-medium', isOut ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning')}>
                                {isOut ? t('Out') : t('Low')}
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
                              <button onClick={() => handleEdit(i)} className="icon-btn" aria-label={t('Edit {name}', { name: i.product_name })}>
                                <Pencil size={16} />
                              </button>
                              <button onClick={() => setDeleteId(i.id)} className="icon-btn-danger" aria-label={t('Delete {name}', { name: i.product_name })}>
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
            <AlertDialogTitle>{t('Delete this product?')}</AlertDialogTitle>
            <AlertDialogDescription>{t('This cannot be undone. Orders referencing this product may be affected.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('Delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>);

}