import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFAB } from '@/context/FABContext';
import { useAuth } from '@/context/AuthContext';
import { formatTaka, EXPENSE_TYPES } from '@/lib/constants';
import SkeletonLoader from '@/components/SkeletonLoader';
import EmptyState from '@/components/EmptyState';
import ModalShell from '@/components/ModalShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, Pencil, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Receipt, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { exportXLSX, todaySuffix } from '@/lib/xlsxExport';
import { format as fnsFormat, subDays, startOfDay, startOfToday } from 'date-fns';

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
type DateFilter = 'today' | '7days' | '30days' | 'custom';

const PAGE_SIZE = 20;

const nativeSelectClass =
  'w-full h-[44px] px-3 rounded-lg border border-border bg-background text-foreground text-[15px] font-semibold cursor-pointer appearance-auto md:h-[44px] max-md:h-[48px] max-md:text-[16px]';

const TYPE_BADGE: Record<string, string> = {
  'Ad Spend': 'bg-orange-300 text-destructive',
  'Shipping': 'bg-emerald-200 text-emerald-700',
  'Miscellaneous': 'bg-indigo-400 text-cyan-900',
};

export default function Expenses() {
  const { openModal } = useFAB();
  const { ownerIdForQueries, isViewer } = useAuth();
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
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
    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false });
    if (error) { toast.error('Failed to load expenses'); console.error(error); }
    else setExpenses((data as ExpenseRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  // Listen for FAB-triggered expense adds
  const { activeModal } = useFAB();
  const prevModal = useState<string | null>(null);
  useEffect(() => {
    // When GlobalExpenseModal closes (activeModal goes from 'expense' to null), refresh
    if (prevModal[0] === 'expense' && activeModal !== 'expense') fetchExpenses();
    prevModal[0] = activeModal;
  }, [activeModal, fetchExpenses]);

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (dateFilter) {
      case 'today': return { from: startOfToday(), to: now };
      case '7days': return { from: startOfDay(subDays(now, 7)), to: now };
      case '30days': return { from: startOfDay(subDays(now, 30)), to: now };
      default: return { from: startOfDay(subDays(now, 365)), to: now };
    }
  }, [dateFilter]);

  const filtered = useMemo(() => {
    let list = expenses.filter((e) => {
      const d = new Date(e.date);
      return d >= dateRange.from && d <= dateRange.to;
    });
    if (typeFilter !== 'all') list = list.filter((e) => e.type === typeFilter);
    return list;
  }, [expenses, dateRange, typeFilter]);

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
      if (error) { toast.error('Failed to update expense', { description: error.message }); setSubmitting(false); return; }
      toast.success('Expense updated ✓');
    } else {
      const { error } = await supabase.from('expenses').insert({ ...payload, owner_id: ownerIdForQueries });
      if (error) { toast.error('Failed to add expense', { description: error.message }); setSubmitting(false); return; }
      toast.success('Expense saved ✓');
    }
    setModalOpen(false);
    fetchExpenses();
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('expenses').delete().eq('id', deleteId);
    if (error) toast.error('Failed to delete expense');
    else { toast.success('Expense deleted'); fetchExpenses(); }
    setDeleteId(null);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const headers = ['Type', 'Amount ৳', 'Platform', 'Notes', 'Date'];
      const rows = filtered.map(e => [
        e.type, e.amount, e.platform || '', e.notes || '',
        fnsFormat(new Date(e.date), 'dd/MM/yyyy'),
      ]);
      const totals = ['TOTAL', filtered.reduce((s, e) => s + e.amount, 0), '', '', ''];
      exportXLSX({ headers, rows, totalsRow: totals, filename: `Expenses_Export_${todaySuffix()}.xlsx` });
      toast.success('Export complete ✓');
    } catch { toast.error('Export failed'); }
    setExporting(false);
  }

  const thClass = 'cursor-pointer select-none whitespace-nowrap px-3 py-3 text-left uppercase tracking-wider transition-colors font-extrabold text-sm text-accent';
  const thStatic = 'whitespace-nowrap px-3 py-3 text-left uppercase tracking-wider font-extrabold text-sm text-accent';

  const metricCards = [
    { label: 'Ad Spend', value: metrics.adSpend },
    { label: 'Shipping', value: metrics.shipping },
    { label: 'Miscellaneous', value: metrics.misc },
    { label: 'Grand Total', value: metrics.total },
  ];

  return (
    <div>
      <h1 className="mb-5 text-[28px] font-bold text-pink-200">Expenses</h1>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v as DateFilter); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7days">7 Days</SelectItem>
            <SelectItem value="30days">30 Days</SelectItem>
            <SelectItem value="custom">All Time</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {EXPENSE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/5 font-extrabold" onClick={handleExport} disabled={exporting || filtered.length === 0}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {exporting ? 'Exporting...' : 'Export XLSX'}
        </Button>
        {!isViewer && (
          <Button className="h-11 gap-2 px-5 font-bold max-md:w-full" onClick={openAdd}>
            <Plus size={18} />
            Add Expense
          </Button>
        )}
      </div>

      {/* Metrics Bar */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {metricCards.map(m => (
          <div key={m.label} className="stat-hover rounded-lg border border-border p-4 bg-[var(--chart-card-bg)] text-accent font-extrabold text-sm cursor-pointer">
            <p className="uppercase tracking-wider text-muted-foreground font-extrabold text-sm">{m.label}</p>
            <p className="mt-1 text-xl font-extrabold text-cyan-500">{formatTaka(m.value)}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <SkeletonLoader variant="row" count={8} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No expenses recorded"
          message="Start tracking your costs."
          actionLabel="Add Expense"
          onAction={openAdd}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className={cn(thStatic, "bg-secondary")}>Type</th>
                  <th className={thClass} onClick={() => toggleSort('amount')}>Amount ৳ <SortIcon col="amount" /></th>
                  <th className={thStatic}>Platform</th>
                  <th className={thStatic}>Notes</th>
                  <th className={thClass} onClick={() => toggleSort('date')}>Date <SortIcon col="date" /></th>
                  <th className={thStatic}>Actions</th>
                </tr>
              </thead>
              <tbody>
                <TooltipProvider>
                  {paged.map(e => (
                    <tr key={e.id} className="table-row-hover border-b border-border last:border-0">
                      <td className="px-3 py-2.5 bg-[var(--chart-card-bg)] font-extrabold">
                        <span className={cn('inline-block rounded-full px-3 py-0.5 font-extrabold text-xs', TYPE_BADGE[e.type] || TYPE_BADGE['Miscellaneous'])}>
                          {e.type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums bg-[var(--chart-card-bg)] font-extrabold">{formatTaka(e.amount)}</td>
                      <td className="px-3 py-2.5 bg-[var(--chart-card-bg)] font-extrabold text-sm text-orange-300">{e.platform || '—'}</td>
                      <td className="px-3 py-2.5 bg-[var(--chart-card-bg)] font-extrabold text-xs max-w-[200px]">
                        {e.notes ? (
                          e.notes.length > 40 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default truncate block">{e.notes.slice(0, 40)}…</span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[300px]">{e.notes}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="font-extrabold text-sm">{e.notes}</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums bg-[var(--chart-card-bg)] font-extrabold">{fnsFormat(new Date(e.date), 'dd/MM/yyyy')}</td>
                      <td className="px-3 py-2.5 bg-[var(--chart-card-bg)]">
                        {!isViewer && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(e)} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95">
                              <Pencil size={18} />
                            </button>
                            <button onClick={() => setDeleteId(e.id)} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 active:scale-95">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </TooltipProvider>
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => Math.abs(p - page) <= 2 || p === 1 || p === totalPages)
                .map((p, i, arr) => {
                  const prev = arr[i - 1];
                  const gap = prev && p - prev > 1;
                  return (
                    <span key={p}>
                      {gap && <span className="px-1 text-muted-foreground">…</span>}
                      <Button variant={page === p ? 'default' : 'outline'} size="sm" className={cn('min-w-[36px]', page === p && 'font-bold')} onClick={() => setPage(p)}>
                        {p}
                      </Button>
                    </span>
                  );
                })}
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Add/Edit Expense Modal */}
      <ModalShell isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editExpense ? 'Edit Expense' : 'Add Expense'}>
        <div className="flex flex-col gap-4">
          <div>
            <Label>Type *</Label>
            <select value={formType} onChange={e => setFormType(e.target.value)} required className={nativeSelectClass}>
              <option value="">Select Type</option>
              {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Label>Amount ৳ *</Label>
            <Input type="number" min={0} step="0.01" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>Platform</Label>
            <Input value={formPlatform} onChange={e => setFormPlatform(e.target.value)} placeholder="e.g. Facebook Ads, Pathao, Sundarban Courier" />
          </div>
          <div>
            <Label>Notes</Label>
            <textarea
              value={formNotes}
              onChange={e => { if (e.target.value.length <= 300) setFormNotes(e.target.value); }}
              placeholder="Optional notes..."
              maxLength={300}
              className="w-full min-h-[80px] px-3 py-2 rounded-lg border border-border bg-background text-foreground text-[15px] resize-y font-extrabold"
            />
            <p className="mt-1 text-xs text-muted-foreground text-right">{formNotes.length}/300</p>
          </div>
          <div>
            <Label>Date *</Label>
            <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
          </div>
          <Button onClick={handleSave} disabled={!isValid || submitting} className="mt-2 h-12 w-full font-bold text-base">
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : editExpense ? 'Update Expense' : 'Save Expense'}
          </Button>
        </div>
      </ModalShell>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
