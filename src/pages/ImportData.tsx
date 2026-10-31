import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, Bot, CheckCircle2, Download, FileSpreadsheet, History, Loader2, Lock,
  Package, Receipt, RotateCcw, ShieldCheck, ShoppingBag, Sparkles, Undo2, UploadCloud, Wand2,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import GlowBackdrop from '@/components/GlowBackdrop';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useReadOnly } from '@/hooks/useReadOnly';
import { useSubscription } from '@/context/SubscriptionContext';
import { useNotifications } from '@/context/NotificationContext';
import { cn } from '@/lib/utils';
import { ENTITY_LABELS, FIELDS, missingRequired, type Entity, type Mapping } from '@/lib/import/fields';
import { ACCEPTED_EXTENSIONS, ImportFileError, readSpreadsheet, type SheetData } from '@/lib/import/readFile';
import { buildRecords, type BuiltRecords, type Overrides } from '@/lib/import/build';
import { planSheets, rememberLayout, type SheetPlan, type SheetTarget } from '@/lib/import/matcher';
import { listImports, runImport, undoImport, type ImportCounts, type ImportRecord } from '@/lib/import/importApi';
import { downloadTemplate } from '@/lib/import/template';

const ENTITIES: Entity[] = ['inventory', 'orders', 'expenses'];
const ENTITY_ICONS: Record<Entity, typeof Package> = { inventory: Package, orders: ShoppingBag, expenses: Receipt };
const ORIGIN_LABEL: Record<SheetPlan['origin'], string> = {
  ai: 'Matched by Lumina AI',
  remembered: 'Same layout as last time',
  auto: 'Matched automatically',
};
const MAX_ISSUES_SHOWN = 50;

type Step = 'upload' | 'reading' | 'review' | 'importing' | 'done';

function sampleOf(sheet: SheetData, column: number) {
  const value = sheet.rows.find((r) => String(r[column] ?? '').trim() !== '')?.[column];
  return value === undefined ? '' : String(value).slice(0, 40);
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export default function ImportData() {
  const navigate = useNavigate();
  const readOnly = useReadOnly();
  const { refresh: refreshSubscription } = useSubscription();
  const { refreshCount } = useNotifications();

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [plans, setPlans] = useState<SheetPlan[]>([]);
  const [overrides, setOverrides] = useState<Overrides[]>([]);
  const [result, setResult] = useState<ImportCounts | null>(null);
  const [dragging, setDragging] = useState(false);
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [undoTarget, setUndoTarget] = useState<ImportRecord | null>(null);
  const [undoing, setUndoing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await listImports());
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setStep('reading');
    setFileName(file.name);
    try {
      const read = await readSpreadsheet(file);
      const planned = await planSheets(read);
      setSheets(read);
      setPlans(planned);
      setOverrides(read.map(() => ({})));
      setStep('review');
    } catch (e) {
      toast.error(e instanceof ImportFileError ? e.message : "Lumina couldn't read that file.");
      setStep('upload');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const built: (BuiltRecords | null)[] = useMemo(
    () => sheets.map((s, i) => {
      const plan = plans[i];
      if (!plan || plan.target === 'skip' || missingRequired(plan.target, plan.mapping).length) return null;
      return buildRecords(plan.target, s, plan.mapping, overrides[i]);
    }),
    [sheets, plans, overrides],
  );

  const totals = useMemo(() => {
    const records: Record<Entity, Record<string, unknown>[]> = { inventory: [], orders: [], expenses: [] };
    let invalid = 0;
    built.forEach((b, i) => {
      const target = plans[i]?.target;
      if (!b || !target || target === 'skip') return;
      records[target].push(...b.records);
      invalid += b.invalidRows;
    });
    return { records, invalid };
  }, [built, plans]);

  const blocked = plans.some((p) => p.target !== 'skip' && missingRequired(p.target, p.mapping).length > 0);
  const recordCount = ENTITIES.reduce((n, e) => n + totals.records[e].length, 0);

  const updatePlan = (i: number, next: Partial<SheetPlan>) =>
    setPlans((prev) => prev.map((p, k) => (k === i ? { ...p, ...next } : p)));

  const changeTarget = (i: number, target: SheetTarget) => {
    // Keep matches that still make sense for the new type.
    const valid = target === 'skip' ? new Set<string>() : new Set(FIELDS[target].map((f) => f.key));
    updatePlan(i, { target, mapping: plans[i].mapping.map((f) => (f && valid.has(f) ? f : null)) });
    setOverrides((prev) => prev.map((o, k) => (k === i ? {} : o)));
  };

  const changeColumn = (i: number, column: number, field: string | null) => {
    const mapping: Mapping = plans[i].mapping.map((f, c) => {
      if (c === column) return field;
      return f === field ? null : f; // a field belongs to one column
    });
    updatePlan(i, { mapping });
  };

  const setOverride = (i: number, key: string, value: string) =>
    setOverrides((prev) => prev.map((o, k) => (k === i ? { ...o, [key]: value } : o)));

  const startImport = async () => {
    setStep('importing');
    try {
      const counts = await runImport(fileName, totals.records);
      sheets.forEach((s, i) => rememberLayout(s, plans[i]));
      setResult(counts);
      setStep('done');
      refreshSubscription();
      refreshCount();
      loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The import did not finish, and nothing was saved.');
      setStep('review');
    }
  };

  const reset = () => {
    setStep('upload');
    setSheets([]);
    setPlans([]);
    setOverrides([]);
    setResult(null);
  };

  const confirmUndo = async () => {
    if (!undoTarget) return;
    setUndoing(true);
    try {
      await undoImport(undoTarget.id);
      toast.success(`Undid the import of ${undoTarget.file_name}`);
      refreshSubscription();
      loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not undo that import.');
    } finally {
      setUndoing(false);
      setUndoTarget(null);
    }
  };

  if (readOnly) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Import data" subtitle="Bring your existing records into Lumina." />
        <div className="surface">
          <EmptyState icon={Lock} title="Importing isn't available" message="Only the owner and managers can import data, and the workspace needs an active plan." />
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate mx-auto max-w-5xl">
      <GlowBackdrop />
      <PageHeader
        title="Import data"
        subtitle="Bring your products, orders and expenses in from Excel or CSV."
        actions={
          step === 'review' ? (
            <Button variant="outline" onClick={reset} className="gap-1.5 max-sm:flex-1">
              <ArrowLeft size={15} /> Choose another file
            </Button>
          ) : (
            <Button variant="outline" onClick={() => downloadTemplate()} className="gap-1.5 max-sm:flex-1">
              <Download size={15} /> Download template
            </Button>
          )
        }
      />

      {(step === 'upload' || step === 'reading') && (
        <>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
            className={cn(
              'surface relative flex cursor-pointer flex-col items-center justify-center overflow-hidden px-6 py-14 text-center transition',
              dragging ? 'border-primary/60 bg-primary/[0.06]' : 'hover:border-primary/40',
              step === 'reading' && 'pointer-events-none',
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(',')}
              className="sr-only"
              aria-label="Choose a spreadsheet to import"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-2xl bg-primary/25 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
                {step === 'reading' ? <Loader2 size={28} className="animate-spin" /> : <UploadCloud size={28} />}
              </div>
            </div>
            {step === 'reading' ? (
              <>
                <p className="text-base font-semibold">Reading {fileName}…</p>
                <p className="mt-1 text-sm text-muted-foreground">Lumina AI is matching your columns.</p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold">Drop your Excel or CSV file here</p>
                <p className="mt-1 text-sm text-muted-foreground">or click to choose a file · .xlsx, .xls or .csv up to 5 MB</p>
              </>
            )}
          </label>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Wand2, title: 'Any layout', text: 'English, Banglish or Bangla columns, several sheets, messy dates and ৳ prices.' },
              { icon: ShieldCheck, title: 'Stays private', text: 'Your file is read on your device. Only column names and 5 sample rows help the AI match.' },
              { icon: RotateCcw, title: 'Safe to try', text: "Check everything before saving. Duplicates are skipped and any import can be undone." },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="surface flex gap-3 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon size={17} /></span>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="surface mt-6 p-5">
            <div className="mb-3 flex items-center gap-2">
              <History size={16} className="text-primary" />
              <h2 className="text-sm font-semibold">Import history</h2>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No imports yet. Old orders you import count as history: they don't change today's stock or send order alerts.</p>
            ) : (
              <ul className="divide-y divide-border">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className={cn('truncate text-sm font-medium', h.undone_at && 'text-muted-foreground line-through')}>{h.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })} ·{' '}
                        {plural(h.counts.orders_created ?? 0, 'order')}, {plural((h.counts.products_created ?? 0) + (h.counts.products_updated ?? 0), 'product')}, {plural(h.counts.expenses_created ?? 0, 'expense')}
                      </p>
                    </div>
                    {h.undone_at ? (
                      <span className="text-xs text-muted-foreground">Undone</span>
                    ) : (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setUndoTarget(h)}>
                        <Undo2 size={14} /> Undo
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {(step === 'review' || step === 'importing') && (
        <div className="space-y-5 pb-28">
          {sheets.map((sheet, i) => {
            const plan = plans[i];
            const b = built[i];
            const missing = plan.target === 'skip' ? [] : missingRequired(plan.target, plan.mapping);
            const fields = plan.target === 'skip' ? [] : FIELDS[plan.target];
            const Icon = plan.target === 'skip' ? FileSpreadsheet : ENTITY_ICONS[plan.target];
            return (
              <section key={sheet.name + i} className="surface overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon size={18} /></span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{sheet.name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        {plural(sheet.rows.length, 'row')} ·
                        {plan.origin === 'ai' && <Sparkles size={11} className="text-highlight" />}
                        {ORIGIN_LABEL[plan.origin]}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Import as</span>
                    <Select value={plan.target} onValueChange={(v) => changeTarget(i, v as SheetTarget)} disabled={step === 'importing'}>
                      <SelectTrigger className="h-9 w-40" aria-label={`Import ${sheet.name} as`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ENTITIES.map((e) => <SelectItem key={e} value={e}>{ENTITY_LABELS[e]}</SelectItem>)}
                        <SelectItem value="skip">Don't import</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {plan.target !== 'skip' && (
                  <div className="p-4">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {sheet.headers.map((h, c) => (
                        <div key={c} className={cn('rounded-xl border p-3', plan.mapping[c] ? 'border-primary/25 bg-primary/[0.04]' : 'border-border')}>
                          <p className="truncate text-sm font-medium" title={h}>{h}</p>
                          <p className="mb-2 truncate text-xs text-muted-foreground">{sampleOf(sheet, c) || '—'}</p>
                          <Select
                            value={plan.mapping[c] ?? 'none'}
                            onValueChange={(v) => changeColumn(i, c, v === 'none' ? null : v)}
                            disabled={step === 'importing'}
                          >
                            <SelectTrigger className="h-8 text-xs" aria-label={`Lumina field for ${h}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Don't import this column</SelectItem>
                              {fields.map((f) => (
                                <SelectItem key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>

                    {missing.length > 0 && (
                      <p className="mt-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                        <AlertTriangle size={15} /> Choose a column for {missing.map((f) => f.label).join(' and ')} to import this sheet.
                      </p>
                    )}

                    {b && (
                      <div className="mt-4">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-success/10 px-2.5 py-1 font-medium text-success">{plural(b.records.length, 'row')} ready</span>
                          {b.invalidRows > 0 && (
                            <span className="rounded-full bg-warning/10 px-2.5 py-1 font-medium text-warning">{plural(b.invalidRows, 'row')} {b.invalidRows === 1 ? 'needs' : 'need'} attention</span>
                          )}
                          {b.notes.length > 0 && (
                            <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground" title={b.notes[0].message}>
                              {plural(b.notes.length, 'channel')} saved as not specified
                            </span>
                          )}
                        </div>

                        {b.issues.length > 0 && (
                          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
                            <table className="w-full min-w-[520px] text-sm">
                              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                                <tr><th className="px-3 py-2 font-medium">Row</th><th className="px-3 py-2 font-medium">Problem</th><th className="px-3 py-2 font-medium">Fix it here</th></tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {b.issues.slice(0, MAX_ISSUES_SHOWN).map((issue) => {
                                  const key = `${issue.index}:${issue.column}`;
                                  return (
                                    <tr key={key + issue.field}>
                                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{issue.row}</td>
                                      <td className="px-3 py-2"><span className="font-medium">{issue.label}</span> {issue.message}</td>
                                      <td className="px-3 py-2">
                                        {issue.column >= 0 ? (
                                          <Input
                                            className="h-8 text-xs"
                                            defaultValue={overrides[i]?.[key] ?? issue.value}
                                            aria-label={`Fix ${issue.label} in row ${issue.row}`}
                                            onBlur={(e) => setOverride(i, key, e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                          />
                                        ) : <span className="text-xs text-muted-foreground">Choose a column above</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                              Rows you don't fix are skipped.{b.issues.length > MAX_ISSUES_SHOWN && ` Showing the first ${MAX_ISSUES_SHOWN} of ${b.issues.length}.`}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          <div className="sticky bottom-4 z-10">
            <div className="surface flex flex-wrap items-center justify-between gap-3 border-primary/30 p-4 shadow-2xl shadow-black/40 backdrop-blur">
              <div className="text-sm">
                <p className="font-semibold">
                  {recordCount === 0 ? 'Nothing to import yet' : ENTITIES.filter((e) => totals.records[e].length).map((e) => plural(totals.records[e].length, ENTITY_LABELS[e].toLowerCase().replace(/s$/, ''))).join(' · ')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {totals.invalid > 0 ? `${plural(totals.invalid, 'row')} with problems will be skipped. ` : ''}
                  Already-saved records are skipped. Old orders won't change today's stock.
                </p>
              </div>
              <Button onClick={startImport} disabled={blocked || recordCount === 0 || step === 'importing'} className="gap-1.5 shadow-glow max-sm:w-full">
                {step === 'importing' ? <><Loader2 size={15} className="animate-spin" /> Importing…</> : <><UploadCloud size={15} /> Import now</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="surface relative overflow-hidden p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/15 text-success"><CheckCircle2 size={28} /></div>
          <h2 className="text-xl font-semibold">Import complete</h2>
          <p className="mt-1 text-sm text-muted-foreground">{fileName} is now part of your Lumina workspace.</p>
          <div className="mx-auto mt-6 grid max-w-xl gap-3 sm:grid-cols-3">
            {[
              { label: 'Orders', value: result.orders_created, extra: result.orders_skipped ? `${result.orders_skipped} already saved` : '' },
              { label: 'Products', value: result.products_created + result.products_updated, extra: result.products_updated ? `${result.products_updated} updated` : '' },
              { label: 'Expenses', value: result.expenses_created, extra: result.expenses_skipped ? `${result.expenses_skipped} already saved` : '' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-2xl font-bold tabular-nums">{s.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{s.label}{s.extra && ` · ${s.extra}`}</p>
              </div>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Button onClick={() => navigate('/')} className="gap-1.5 shadow-glow">See your dashboard</Button>
            <Button variant="outline" onClick={() => navigate('/ai-assistant')} className="gap-1.5"><Bot size={15} /> Ask AI about your history</Button>
            <Button variant="ghost" onClick={reset}>Import another file</Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!undoTarget} onOpenChange={(o) => !o && !undoing && setUndoTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this import?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the orders and expenses imported from {undoTarget?.file_name}, removes the products it added (unless new orders use them), and puts products it updated back to how they were before the import.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={undoing}>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmUndo(); }} disabled={undoing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {undoing ? 'Undoing…' : 'Undo import'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
