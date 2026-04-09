import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, X, Sparkles, BookmarkPlus, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { formatTaka } from '@/lib/constants';
import SkeletonLoader from '@/components/SkeletonLoader';
import AITextRenderer from '@/components/AITextRenderer';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface InsightContext {
  revenue: number;
  profit: number;
  profit_margin: string;
  top_product: string;
  low_stock_items: { name: string; qty: number }[];
  top_sales_source: string;
  total_orders: number;
  total_ad_spend: number;
  date_range_label: string;
}

interface Props {
  context: InsightContext;
  loading: boolean;
}

const SUGGESTION_CHIPS = [
  'Why is profit dropping?',
  'Which product should I restock?',
  'Should I increase prices?',
  'Which sales channel is best?',
  'What are my biggest cost risks?',
  'Am I overspending on ads?',
];

export default function AIInsightsPanel({
  context,
  loading: dataLoading,
}: Props) {
  const { ownerIdForQueries } = useAuth();
  const [insights, setInsights] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [savedToNotes, setSavedToNotes] = useState(false);

  useEffect(() => {
    async function loadCached() {
      const { data } = await supabase
        .from('notes')
        .select('transcript')
        .eq('source_module', 'dashboard')
        .eq('type', 'ai_output')
        .order('created_at', { ascending: false })
        .limit(1);
      const rows = data as { transcript: string }[] | null;
      if (rows && rows.length > 0 && rows[0].transcript) {
        setInsights(rows[0].transcript);
      }
    }
    loadCached();
  }, []);

  const generate = useCallback(
    async (focusQuestion?: string) => {
      if (aiLoading || isDisabled) return;
      setAiLoading(true);
      setSavedToNotes(false);
      try {
        const { data, error } = await supabase.functions.invoke(
          'generate-dashboard-insights',
          { body: { context, focusQuestion } }
        );
        if (error) throw error;
        const text =
          (data as { insights: string })?.insights ||
          'No insights generated.';
        setInsights(text);
      } catch (e: any) {
        console.error('AI Insights error:', e);
        setInsights('Failed to generate insights. Please try again.');
      } finally {
        setAiLoading(false);
        setIsDisabled(true);
        let seconds = 10;
        setCountdown(seconds);
        const timer = setInterval(() => {
          seconds -= 1;
          setCountdown(seconds);
          if (seconds <= 0) {
            clearInterval(timer);
            setIsDisabled(false);
            setCountdown(0);
          }
        }, 1000);
      }
    },
    [context, aiLoading, isDisabled]
  );

  async function handleSaveToNotes() {
    if (!insights || isSaving) return;
    setIsSaving(true);
    try {
      await supabase.from('notes').insert({
        type: 'ai_output',
        source_module: 'dashboard',
        title: `Dashboard Insights — ${format(
          new Date(),
          'dd MMM yyyy'
        )}`,
        transcript: insights,
        owner_id: ownerIdForQueries,
      } as never);
      setSavedToNotes(true);
      toast({ title: 'Saved to Notes ✓' });
      setTimeout(() => setSavedToNotes(false), 3000);
    } catch (e) {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-border p-5 pb-5 shadow-[0_2px_8px_rgba(74,124,89,0.12)] bg-[var(--chart-card-bg)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Sparkles size={20} className="text-[#6366F1]" />
          AI Business Insights
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => generate()}
            disabled={aiLoading || isDisabled}
            className="flex items-center gap-1.5 rounded-lg bg-[#6366F1] px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-[#5558E6] active:scale-[0.97] disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={aiLoading ? 'animate-spin' : ''}
            />
            {countdown > 0 ? `Wait ${countdown}s` : 'Regenerate'}
          </button>
          <button
            onClick={handleSaveToNotes}
            disabled={!insights || isSaving || savedToNotes}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors active:scale-[0.97] disabled:opacity-50 ${
              savedToNotes
                ? 'bg-green-600 text-white'
                : insights
                ? 'bg-[var(--sidebar-bg)] text-white hover:bg-[#3d6a4b]'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {savedToNotes ? (
              <>
                <Check size={14} /> Saved ✓
              </>
            ) : isSaving ? (
              'Saving...'
            ) : (
              <>
                <BookmarkPlus size={14} /> Save to Notes
              </>
            )}
          </button>
          <button
            onClick={() => setInsights(null)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted active:scale-[0.97]"
          >
            <X size={14} />
            Clear
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="shrink-0 rounded-lg p-4 md:w-[280px] bg-[var(--sidebar-bg)]">
          <h4 className="mb-3 text-sm font-extrabold text-[#e7e5df]">
            Your Business
          </h4>
          <div className="space-y-2 text-sm">
            <Row
              label="Revenue"
              value={formatTaka(context.revenue)}
            />
            <Row
              label="Profit"
              value={formatTaka(context.profit)}
              color={
                context.profit >= 0 ? '#10B981' : '#EF4444'
              }
            />
            <Row label="Margin" value={context.profit_margin} />
            <Row
              label="Top Product"
              value={context.top_product || '—'}
            />
            <Row
              label="Low Stock"
              value={`${context.low_stock_items.length} items`}
              color={
                context.low_stock_items.length > 0
                  ? '#F59E0B'
                  : undefined
              }
            />
            <Row
              label="Best Channel"
              value={context.top_sales_source || '—'}
            />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {SUGGESTION_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => generate(chip)}
                disabled={aiLoading || isDisabled}
                className="shrink-0 rounded-full py-1.5 transition-colors active:scale-[0.97] disabled:opacity-50 bg-foreground text-[sidebar-accent-foreground] text-sidebar border-0 border-[#fffafa] px-[12px] font-medium"
              >
                {chip}
              </button>
            ))}
          </div>

          <div>
            {aiLoading ? (
              <div className="space-y-3 py-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[#6366F1] animate-pulse">
                  <Sparkles size={16} />
                  Analyzing your business...
                </div>
                <SkeletonLoader variant="row" count={5} />
              </div>
            ) : insights ? (
              <AITextRenderer content={insights} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Click Regenerate or choose a question above to
                get AI insights
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-extrabold text-[#07ab4c]/[0.92]">
        {label}
      </span>
      <span className="font-bold text-[#07ab4c]" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
