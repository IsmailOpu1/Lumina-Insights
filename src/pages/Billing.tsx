import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Check, CreditCard, Loader2, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import SkeletonLoader from '@/components/SkeletonLoader';
import { useSubscription } from '@/context/SubscriptionContext';
import { formatCurrency } from '@/hooks/useCurrency';
import { functionErrorMessage } from '@/lib/dbErrors';
import {
  accessEndsAt, daysUntil, isOpenEnded, paymentStatusLabel, planLabel, proIsRunning,
  type BillingPeriod, type Plan, type PlanId,
} from '@/lib/subscription';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

// SSLCommerz charges in taka whatever currency the workspace reports in.
const taka = (n: number) => formatCurrency(n, 'BDT');

const PAYMENT_RESULT: Record<string, { kind: 'success' | 'error' | 'info'; text: string }> = {
  success: { kind: 'success', text: 'Payment received — your plan is active. Thank you!' },
  pending: { kind: 'info', text: "We're confirming your payment with SSLCommerz. This page will update shortly." },
  failed: { kind: 'error', text: 'The payment did not go through. You have not been charged; please try again.' },
  cancelled: { kind: 'info', text: 'Payment cancelled. Your plan has not changed.' },
};

function planFeatures(p: Plan): string[] {
  return [
    p.max_orders_per_month === null ? 'Unlimited orders' : `${p.max_orders_per_month} orders per month`,
    p.max_team_members === 0 ? 'Just you (no team members)' : `Up to ${p.max_team_members} team members`,
    `AI assistant: ${p.ai_chat_per_day} questions per day`,
    p.marketing_per_month === null ? 'Unlimited Marketing AI content' : `Marketing AI: ${p.marketing_per_month} per month`,
    ...(p.weekly_summary ? ['Weekly summary every Monday'] : []),
    ...(p.data_export ? ['Excel export'] : []),
  ];
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm font-bold text-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{limit === null ? `${used} · unlimited` : `${used} / ${limit}`}</span>
      </div>
      {limit !== null && (
        <div className="mt-1.5 h-2 rounded-full bg-muted">
          <div
            className={cn('h-2 rounded-full', pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-[#F59E0B]' : 'bg-primary')}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function Billing() {
  const { subscription, loading, refresh } = useSubscription();
  const [searchParams, setSearchParams] = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<Tables<'payments'>[]>([]);
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [paying, setPaying] = useState<PlanId | null>(null);

  useEffect(() => {
    supabase.from('plans').select('*').order('sort_order').then(({ data }) => setPlans(data ?? []));
    supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setPayments(data ?? []));
  }, []);

  // Back from SSLCommerz: show the outcome once, then refresh the plan.
  useEffect(() => {
    const result = searchParams.get('payment');
    if (!result) return;
    const message = PAYMENT_RESULT[result];
    if (message) {
      if (message.kind === 'success') toast.success(message.text);
      else if (message.kind === 'error') toast.error(message.text);
      else toast(message.text);
    }
    refresh();
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, refresh]);

  async function pay(plan: PlanId) {
    setPaying(plan);
    const { data, error } = await supabase.functions.invoke('create-payment', {
      body: { plan, billing_period: period },
    });
    if (error || !data?.url) {
      toast.error(await functionErrorMessage(error, 'Could not start the payment. Please try again.'));
      setPaying(null);
      return;
    }
    window.location.href = data.url;
  }

  if (loading) return <SkeletonLoader variant="card" count={3} />;

  if (!subscription) {
    return <p className="text-muted-foreground">Billing becomes available once your business profile is set up.</p>;
  }

  const ends = accessEndsAt(subscription);
  const daysLeft = daysUntil(ends);
  const sectionClass = 'rounded-xl border border-border p-5 bg-[var(--chart-card-bg)]';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">Billing</h1>

      {/* Current plan */}
      <section className={sectionClass}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-muted-foreground">Current plan</p>
            <p className="text-2xl font-extrabold text-foreground">{planLabel(subscription)}</p>
            <p className={cn('mt-1 text-sm font-semibold', subscription.state === 'expired' ? 'text-destructive' : 'text-muted-foreground')}>
              {subscription.state === 'expired'
                ? 'Expired — your workspace is read-only until you choose a plan.'
                : isOpenEnded(subscription)
                  ? 'Active'
                  : `${subscription.state === 'trialing' ? 'Trial ends' : 'Paid until'} ${format(new Date(ends!), 'd MMM yyyy')} · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
            </p>
          </div>
          {!subscription.is_owner && (
            <p className="max-w-xs text-sm text-muted-foreground">Only the workspace owner can change the plan or pay.</p>
          )}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Meter label="Orders this month" used={subscription.usage.orders_this_month} limit={subscription.limits.max_orders_per_month} />
          <Meter label="Team members" used={subscription.usage.team_members} limit={subscription.limits.max_team_members} />
          <Meter label="AI questions today" used={subscription.usage.ai_chat_today} limit={subscription.limits.ai_chat_per_day} />
          <Meter label="Marketing AI this month" used={subscription.usage.marketing_this_month} limit={subscription.limits.marketing_per_month} />
        </div>
      </section>

      {/* Plans */}
      {subscription.is_owner && (
        <section className={sectionClass}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground"><CreditCard size={18} /> Choose a plan</h2>
            <div className="inline-flex rounded-lg border border-border p-1" role="group" aria-label="Billing period">
              {(['monthly', 'yearly'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  aria-pressed={period === p}
                  className={cn('rounded-md px-3 py-1.5 text-sm font-bold capitalize', period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
                >
                  {p}{p === 'yearly' && ' · 2 months free'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((p) => {
              const price = period === 'yearly' ? p.yearly_price : p.monthly_price;
              const isCurrent = subscription.state === 'active' && subscription.plan === p.id && subscription.billing_period === period;
              const blocked = p.id === 'starter' && proIsRunning(subscription);
              return (
                <div key={p.id} className={cn('flex flex-col rounded-xl border p-5', p.id === 'pro' ? 'border-primary' : 'border-border')}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-extrabold text-foreground">{p.name}</h3>
                    {p.id === 'pro' && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">Most popular</span>}
                  </div>
                  <p className="mt-2 text-3xl font-extrabold text-foreground">
                    {taka(price)}
                    <span className="text-base font-semibold text-muted-foreground"> / {period === 'yearly' ? 'year' : 'month'}</span>
                  </p>
                  <ul className="my-4 flex flex-1 flex-col gap-2">
                    {planFeatures(p).map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                        <Check size={16} className="mt-0.5 shrink-0 text-primary" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Button onClick={() => pay(p.id as PlanId)} disabled={paying !== null || blocked} className="h-11 w-full font-bold">
                    {paying === p.id
                      ? <Loader2 className="animate-spin" size={18} />
                      : isCurrent ? `Renew ${p.name}` : `Pay ${taka(price)}`}
                  </Button>
                  {blocked && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      You're on Pro until {format(new Date(ends!), 'd MMM yyyy')}. You can switch to Starter after that.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Pay securely with bKash, Nagad, Rocket or card through SSLCommerz. Plans don't renew automatically —
            paying again while a plan or trial is active adds the new period on top, so no days are lost.
          </p>
        </section>
      )}

      {/* History */}
      {subscription.is_owner && payments.length > 0 && (
        <section className={sectionClass}>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground"><Receipt size={18} /> Payment history</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Plan</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-border text-foreground">
                    <td className="py-2 pr-4">{format(new Date(p.created_at), 'd MMM yyyy')}</td>
                    <td className="py-2 pr-4 capitalize">{p.plan} · {p.billing_period}</td>
                    <td className="py-2 pr-4 tabular-nums">{taka(p.amount)}</td>
                    <td className="py-2 pr-4">{p.card_type || '—'}</td>
                    <td className="py-2">{paymentStatusLabel(p.status, p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
