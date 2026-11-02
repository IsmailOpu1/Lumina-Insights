import { useEffect, useState } from 'react';
import { format, min, startOfMonth, subDays } from 'date-fns';
import { Loader2, Target } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { fetchAll } from '@/lib/fetchAll';
import { forecastMonth, goalProgress, PACE_DAYS, type ForecastExpense, type ForecastOrder } from '@/lib/forecast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { currentDateLocale, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import ChartCard from './ChartCard';

interface Props {
  /** Changes whenever the dashboard reloads, so this reloads with it. */
  reloadKey: unknown;
}

interface Data {
  orders: ForecastOrder[];
  expenses: ForecastExpense[];
  firstSale: string | null;
  goal: number | null;
}

/** Forecasts are estimates: round them so they don't look exact. */
const roughly = (n: number) => Math.round(n / 100) * 100;

/**
 * This calendar month, whatever the dashboard's date filter: the month so
 * far, where it's heading at the recent pace, and the owner's goal.
 */
export default function MonthForecast({ reloadKey }: Props) {
  const { t } = useT();
  const { formatCurrency } = useCurrency();
  const { ownerIdForQueries, isOwner } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ownerIdForQueries) return;
    let cancelled = false;
    const now = new Date();
    const since = format(min([startOfMonth(now), subDays(now, PACE_DAYS)]), 'yyyy-MM-dd');
    Promise.all([
      fetchAll((a, b) => supabase.from('orders').select('date, status, selling_price, quantity, profit_per_order')
        .gte('date', since).order('id').range(a, b)),
      fetchAll((a, b) => supabase.from('expenses').select('date, amount').gte('date', since).order('id').range(a, b)),
      supabase.from('orders').select('date').order('date', { ascending: true }).limit(1),
      supabase.from('user_settings').select('monthly_revenue_goal').eq('user_id', ownerIdForQueries).maybeSingle(),
    ]).then(([orders, expenses, first, settings]) => {
      if (cancelled || orders.error || expenses.error) return;
      setData({
        orders: orders.data as ForecastOrder[],
        expenses: expenses.data as ForecastExpense[],
        firstSale: first.data?.[0]?.date ?? null,
        goal: settings.data?.monthly_revenue_goal ?? null,
      });
    });
    return () => { cancelled = true; };
  }, [reloadKey, ownerIdForQueries]);

  if (!data) return null;
  const f = forecastMonth(data.orders, data.expenses, data.firstSale);
  const goal = data.goal ? goalProgress(data.goal, f) : null;
  const month = format(f.monthStart, 'MMMM', { locale: currentDateLocale() });
  const range = (low: number, high: number) =>
    roughly(low) === roughly(high) ? formatCurrency(roughly(low)) : `${formatCurrency(roughly(low))} – ${formatCurrency(roughly(high))}`;

  async function saveGoal(value: number | null) {
    setSaving(true);
    const { error } = await supabase.from('user_settings').update({ monthly_revenue_goal: value }).eq('user_id', ownerIdForQueries!);
    setSaving(false);
    if (error) {
      toast.error(t('Could not save the goal'));
      return;
    }
    setData((d) => d && { ...d, goal: value });
    setEditing(false);
  }

  function startEditing() {
    setDraft(data?.goal ? String(data.goal) : '');
    setEditing(true);
  }

  const draftValue = Number(draft);
  const draftValid = draft.trim() !== '' && Number.isFinite(draftValue) && draftValue > 0;

  return (
    <ChartCard
      title={t('{month} so far', { month })}
      subtitle={t('This calendar month, whatever the date filter above')}
      className="mb-6"
      action={isOwner && !editing && (
        <button onClick={startEditing} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <Target size={13} />
          {data.goal ? t('Change goal') : t('Set a monthly goal')}
        </button>
      )}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="eyebrow">{t('Revenue')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{formatCurrency(f.revenueSoFar)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('Profit')} <span className={cn('font-medium tabular-nums', f.profitSoFar >= 0 ? 'text-success' : 'text-destructive')}>{formatCurrency(f.profitSoFar)}</span>
          </p>
        </div>

        <div>
          <p className="eyebrow">{t('At this pace, by month end')}</p>
          {f.revenue && f.profit ? (
            <>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{range(f.revenue.low, f.revenue.high)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('Profit')} <span className="font-medium tabular-nums text-foreground">{range(f.profit.low, f.profit.high)}</span>
                {' · '}
                {f.daysLeft === 1 ? t('1 day left') : t('{n} days left', { n: f.daysLeft })}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t('A forecast appears after a week with at least 5 sales.')}</p>
          )}
        </div>
      </div>

      {editing && (
        <form
          className="mt-5 flex flex-wrap items-end gap-2 border-t border-border pt-4"
          onSubmit={(e) => { e.preventDefault(); if (draftValid) saveGoal(draftValue); }}
        >
          <label className="min-w-[180px] flex-1">
            <span className="mb-1.5 block text-xs text-muted-foreground">{t('Monthly revenue goal')}</span>
            <Input type="number" min={1} inputMode="numeric" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="80000" />
          </label>
          <Button type="submit" disabled={!draftValid || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('Save goal')}
          </Button>
          {data.goal && <Button type="button" variant="ghost" disabled={saving} onClick={() => saveGoal(null)}>{t('Remove goal')}</Button>}
          <Button type="button" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>{t('Cancel')}</Button>
        </form>
      )}

      {goal && !editing && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {t('Goal')} <span className="font-medium tabular-nums text-foreground">{formatCurrency(goal.target)}</span>
            </span>
            <span className={cn('font-medium tabular-nums', goal.reached ? 'text-success' : 'text-foreground')}>
              {t('{pct}% there', { pct: Math.floor(goal.pct) })}
            </span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={t('Monthly goal')}
            aria-valuenow={Math.floor(goal.pct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className={cn('h-full rounded-full', goal.reached ? 'bg-success' : 'bg-primary')} style={{ width: `${goal.pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {goal.reached
              ? t('Goal reached. Well done!')
              : goal.onTrack === null
                ? t('Sell about {amount} a day to reach it.', { amount: formatCurrency(roughly(goal.perDay!)) })
                : goal.onTrack
                  ? t('On track: your pace reaches it. About {amount} a day keeps it safe.', { amount: formatCurrency(roughly(goal.perDay!)) })
                  : t('Behind: you need about {amount} a day to reach it.', { amount: formatCurrency(roughly(goal.perDay!)) })}
          </p>
        </div>
      )}
    </ChartCard>
  );
}
