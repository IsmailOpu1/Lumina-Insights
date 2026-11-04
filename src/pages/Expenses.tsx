import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCachedState } from '@/lib/pageCache';
import { useRefreshOnSave } from '@/context/FABContext';
import { inDayFilter, parseDay, type DayFilter } from '@/lib/dates';
import { useAuth } from '@/context/AuthContext';
import { EXPENSE_TYPES } from '@/lib/constants';
import SkeletonLoader from '@/components/SkeletonLoader';
import EmptyState from '@/components/EmptyState';
import ModalShell from '@/components/ModalShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, Pencil, Trash2, ChevronUp, ChevronDown, Receipt, Loader2, Plus, Megaphone, Truck, Shapes, Wallet } from 'lucide-react';
import PageHeader, { StatStrip } from '@/components/PageHeader';
import Pager from '@/components/Pager';
import Segmented from '@/components/dashboard/Segmented';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { exportXLSX, todaySuffix } from '@/lib/xlsxExport';
import { format as fnsFormat } from 'date-fns';
import { useCurrency } from '@/hooks/useCurrency';
import { dbErrorMessage } from '@/lib/dbErrors';
import { useExportGate } from '@/hooks/useExportGate';
import { fetchAll } from '@/lib/fetchAll';
import { useReadOnly } from '@/hooks/useReadOnly';
import { currentDateLocale, msg, useT } from '@/i18n';

interface ExpenseRow {
  id: string;
  type: string;
  amount: number;
  platform: string | null;
  notes: string | null;
  date: string;
  created_at: string | null;
}

interface ExpenseToEdit {
  id: string;
  type: string;
  amount: number;
  platform: string | null;
  notes: string | null;
  date: string;
}

type SortKey = 'date' | 'amount';
type SortDir = 'asc' | 'desc';
type DateFilter = DayFilter;

const PAGE_SIZE = 20;

const nativeSelectClass =
  'w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm cursor-pointer appearance-auto max-md:h-12 max-md:text-[16px]';

const TYPE_STYLE: Record<string, { badge: string; bar: string }> = {
  'Ad Spend': { badge: 'border-warning/30 bg-warning/10 text-warning', bar: 'bg-warning' },
  'Shipping': { badge: 'border-highlight/30 bg-highlight/10 text-highlight', bar: 'bg-highlight' },
  'Miscellaneous': { badge: 'border-border bg-muted text-muted-foreground', bar: 'bg-muted-foreground/60' },
};

const DATE_OPTIONS: { label: string; value: DateFilter }[] = [
  { label: msg('Today'), value: 'today' },
  { label: msg('7 days'), value: '7days' },
  { label: msg('30 days'), value: '30days' },
  { label: msg('All time'), value: 'custom' },
];

export default function Expenses() {
  const { t } = useT();
  const { formatCurrency, symbol } = useCurrency();
  const canExport = useExportGate();
  const { ownerIdForQueries } = useAuth();
  const readOnly = useReadOnly();
  const [expenses, setExpenses, cached] = useCachedState<ExpenseRow[]>('expenses', []);
  const [loading, setLoading] = useState(!cached);
  const [dateFilter, setDateFilter] = useState<DateFilter>('30days');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const [editExpense, setEditExpense] = useState<ExpenseToEdit | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Modal form state
  const [formType, setFormType] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formPlatform, setFormPlatform] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formDate, setFormDate] = useState(fnsFormat(new Date(), 'yyyy-MM-dd'));
  const [submitting, setSubmitting] = useState(false);

  const fetchExpenses = useCallback(async () => {
    const { data, error } = await fetchAll((a, b) => supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false })
      .order('id')
      .range(a, b));
    if (error) { toast.error(t('Failed to load expenses')); console.error(error); }
    else setExpenses((data as ExpenseRow[]) || []);
    setLoading(false);
  }, [setExpenses]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);
  useRefreshOnSave('expense', fetchExpenses);

  const filtered = useMemo(() => {
    let list = expenses.filter((e) => inDayFilter(e.date, dateFilter));
    if (typeFilter !== 'all') list = list.filter((e) => e.type === typeFilter);
    return list;
  }, [expenses, dateFilter, typeFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sortKey === 'date' ? a.date : a.amount;
      const vb = sortKey === 'date' ? b.date : b.amount;
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Metrics
  const metrics = useMemo(() => {
    const adSpend = filtered.filter(e => e.type === 'Ad Spend').reduce((s, e) => s + e.amount, 0);
    const shipping = filtered.filter(e => e.type === 'Shipping').reduce((s, e) => s + e.amount, 0);
    const misc = filtered.filter(e => e.type === 'Miscellaneous').reduce((s, e) => s + e.amount, 0);
    return { adSpend, shipping, misc, total: adSpend + shipping + misc };
  }, [filtered]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return sortDir === 'asc' ? <ChevronUp className="inline h-3.5 w-3.5" /> : <ChevronDown className="inline h-3.5 w-3.5" />;
  }

  // Modal open helpers
  function openAdd() {
    setEditExpense(null);
    setFormType(''); setFormAmount(''); setFormPlatform(''); setFormNotes('');
    setFormDate(fnsFormat(new Date(), 'yyyy-MM-dd'));
    setSubmitting(false);
    setModalOpen(true);
  }

  function openEdit(e: ExpenseRow) {
    setEditExpense({ id: e.id, type: e.type, amount: e.amount, platform: e.platform, notes: e.notes, date: e.date });
    setFormType(e.type);
    setFormAmount(String(e.amount));
    setFormPlatform(e.platform || '');
    setFormNotes(e.notes || '');
    setFormDate(e.date);
    setSubmitting(false);
    setModalOpen(true);
  }

  const isValid = formType && formAmount && parseFloat(formAmount) > 0 && formDate;

  async function handleSave() {
    if (!isValid || submitting) return;
    setSubmitting(true);
    const payload = {
      type: formType,
      amount: parseFloat(formAmount),
      platform: formPlatform.trim() || null,
      notes: formNotes.trim() || null,
      date: formDate,
    };

    if (editExpense) {
      const { error } = await supabase.from('expenses').update(payload).eq('id', editExpense.id);
      if (error) { toast.error(t('Failed to update expense'), { description: dbErrorMessage(error.message) }); setSubmitting(false); return; }
      toast.success(t('Expense updated ✓'));
    } else {
      const { error } = await supabase.from('expenses').insert({ ...payload, owner_id: ownerIdForQueries });
      if (error) { toast.error(t('Failed to add expense'), { description: dbErrorMessage(error.message) }); setSubmitting(false); return; }
      toast.success(t('Expense saved ✓'));
    }
    setModalOpen(false);
    fetchExpenses();
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('expenses').delete().eq('id', deleteId);
    if (error) toast.error(t('Failed to delete expense'));
    else { toast.success(t('Expense deleted')); fetchExpenses(); }
    setDeleteId(null);
  }

  async function handleExport() {
    if (!canExport()) return;
    setExporting(true);
    try {
      const headers = ['Type', `Amount ${symbol}`, 'Platform', 'Notes', 'Date'];
      const rows = filtered.map(e => [
        e.type, e.amount, e.platform || '', e.notes || '',
        fnsFormat(parseDay(e.date), 'dd/MM/yyyy'),
      ]);
      const totals = ['TOTAL', filtered.reduce((s, e) => s + e.amount, 0), '', '', ''];
      await exportXLSX({ headers, rows, totalsRow: totals, filename: `Expenses_Export_${todaySuffix()}.xlsx` });
      toast.success(t('Export complete ✓'));
    } catch { toast.error(t('Export failed')); }
    setExporting(false);
  }

  const share = (v: number) => (metrics.total > 0 ? t('{pct}% of total', { pct: Math.round((v / metrics.total) * 100) }) : t('No spend yet'));
  const breakdown = [
    { type: 'Ad Spend', value: metrics.adSpend },
    { type: 'Shipping', value: metrics.shipping },
    { type: 'Miscellaneous', value: metrics.misc },
  ];

  const th = (key: SortKey, label: string) => (
    <th className="sortable" onClick={() => toggleSort(key)} aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {label} <SortIcon col={key} />
    </th>
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title={t('Expenses')}
        subtitle={t('Money going out that is not tied to one order: ads, courier bills, packaging, rent. It comes off your net profit.')}
        actions={
          <>
            <Button variant="outline" onClick={handleExport} disabled={exporting || filtered.length === 0} className="max-sm:flex-1">
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {exporting ? t('Exporting...') : t('Export')}
            </Button>
            {!readOnly && (
              <Button className="gap-1.5 shadow-glow max-sm:flex-1" onClick={openAdd}>
                <Plus size={16} />
                {t('Add expense')}
              </Button>
            )}
          </>
        }
      />

      <StatStrip
        className="mb-3"
        stats={[
          { label: t('Total spent'), value: formatCurrency(metrics.total), icon: Wallet, hint: filtered.length === 1 ? t('{n} expense', { n: 1 }) : t('{n} expenses', { n: filtered.length }) },
          { label: t('Ad spend'), value: formatCurrency(metrics.adSpend), icon: Megaphone, hint: share(metrics.adSpend) },
          { label: t('Shipping'), value: formatCurrency(metrics.shipping), icon: Truck, hint: share(metrics.shipping) },
          { label: t('Miscellaneous'), value: formatCurrency(metrics.misc), icon: Shapes, hint: share(metrics.misc) },
        ]}
      />

      {metrics.total > 0 && (
        <div className="surface mb-6 p-4">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={t('Spend by type')}>
            {breakdown.map((b) => b.value > 0 && (
              <div key={b.type} className={TYPE_STYLE[b.type].bar} style={{ width: `${(b.value / metrics.total) * 100}%` }} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            {breakdown.map((b) => (
              <span key={b.type} className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', TYPE_STYLE[b.type].bar)} />
                {t(b.type)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('All types')}</SelectItem>
              {EXPENSE_TYPES.map(type => <SelectItem key={type} value={type}>{t(type)}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Segmented<DateFilter> label={msg('Date range')} value={dateFilter} onChange={(v) => { setDateFilter(v); setPage(1); }} options={DATE_OPTIONS} />
        </div>

        {loading ? (
          <div className="p-4"><SkeletonLoader variant="row" count={8} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={expenses.length === 0 ? t('No expenses recorded') : t('No expenses in this range')}
            message={expenses.length === 0 ? t('Add ad spend, courier bills and other costs to see your true profit.') : t('Try a different type or date range.')}
            actionLabel={readOnly || expenses.length > 0 ? undefined : t('Add expense')}
            onAction={openAdd}
          />
        ) : (
          <>
            {/* Phones get cards; the table would need sideways scrolling. */}
            <ul className="divide-y divide-border md:hidden">
              {paged.map(e => (
                <li key={e.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className={cn('inline-flex rounded-md border px-2 py-0.5 text-xs font-medium', (TYPE_STYLE[e.type] || TYPE_STYLE['Miscellaneous']).badge)}>
                        {t(e.type)}
                      </span>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {[fnsFormat(parseDay(e.date), 'dd MMM yyyy', { locale: currentDateLocale() }), e.platform].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">{formatCurrency(e.amount)}</p>
                  </div>
                  {e.notes && <p className="mt-1.5 break-words text-sm text-muted-foreground">{e.notes}</p>}
                  {!readOnly && (
                    <div className="mt-1 flex justify-end gap-1">
                      <button onClick={() => openEdit(e)} className="icon-btn" aria-label={t('Edit expense')}>
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => setDeleteId(e.id)} className="icon-btn-danger" aria-label={t('Delete expense')}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="data-table min-w-[720px]">
                <thead>
                  <tr>
                    <th>{t('Type')}</th>
                    {th('amount', `${t('Amount')} ${symbol}`)}
                    <th>{t('Platform')}</th>
                    <th>{t('Notes')}</th>
                    {th('date', t('Date'))}
                    {!readOnly && <th className="text-right">{t('Actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  <TooltipProvider>
                    {paged.map(e => (
                      <tr key={e.id}>
                        <td>
                          <span className={cn('inline-flex rounded-md border px-2 py-0.5 text-xs font-medium', (TYPE_STYLE[e.type] || TYPE_STYLE['Miscellaneous']).badge)}>
                            {t(e.type)}
                          </span>
                        </td>
                        <td className="font-medium tabular-nums">{formatCurrency(e.amount)}</td>
                        <td className="text-muted-foreground">{e.platform || '—'}</td>
                        <td className="max-w-[260px] text-muted-foreground">
                          {e.notes ? (
                            e.notes.length > 40 ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="block cursor-default truncate">{e.notes.slice(0, 40)}…</span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[300px]">{e.notes}</TooltipContent>
                              </Tooltip>
                            ) : e.notes
                          ) : '—'}
                        </td>
                        <td className="whitespace-nowrap tabular-nums text-muted-foreground">{fnsFormat(parseDay(e.date), 'dd MMM yyyy', { locale: currentDateLocale() })}</td>
                        {!readOnly && (
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEdit(e)} className="icon-btn" aria-label={t('Edit expense')}>
                                <Pencil size={16} />
                              </button>
                              <button onClick={() => setDeleteId(e.id)} className="icon-btn-danger" aria-label={t('Delete expense')}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </TooltipProvider>
                </tbody>
              </table>
            </div>
            <Pager page={page} totalPages={totalPages} total={sorted.length} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </div>

      {/* Add/Edit Expense Modal */}
      <ModalShell isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editExpense ? t('Edit expense') : t('Add expense')}>
        <div className="flex flex-col gap-4">
          <div>
            <Label>{t('Type')} *</Label>
            <select value={formType} onChange={e => setFormType(e.target.value)} required className={nativeSelectClass}>
              <option value="">{t('Select Type')}</option>
              {EXPENSE_TYPES.map(type => <option key={type} value={type}>{t(type)}</option>)}
            </select>
          </div>
          <div>
            <Label>{t('Amount')} {symbol} *</Label>
            <Input type="number" min={0} step="0.01" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>{t('Platform')}</Label>
            <Input value={formPlatform} onChange={e => setFormPlatform(e.target.value)} placeholder={t('e.g. Facebook Ads, Pathao, Sundarban Courier')} />
          </div>
          <div>
            <Label>{t('Notes')}</Label>
            <textarea
              value={formNotes}
              onChange={e => { if (e.target.value.length <= 300) setFormNotes(e.target.value); }}
              placeholder={t('Optional notes...')}
              maxLength={300}
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground text-right">{formNotes.length}/300</p>
          </div>
          <div>
            <Label>{t('Date')} *</Label>
            <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
          </div>
          <Button onClick={handleSave} disabled={!isValid || submitting} className="mt-2 h-11 w-full font-semibold">
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('Saving...')}</> : editExpense ? t('Update expense') : t('Save expense')}
          </Button>
        </div>
      </ModalShell>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete this expense?')}</AlertDialogTitle>
            <AlertDialogDescription>{t('This cannot be undone.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('Delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
