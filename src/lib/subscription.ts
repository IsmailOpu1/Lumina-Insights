import type { Tables } from '@/integrations/supabase/types';

export type Plan = Tables<'plans'>;
export type PlanId = 'starter' | 'pro';
export type BillingPeriod = 'monthly' | 'yearly';

/** Shape returned by the get_my_subscription() database function. */
export interface Subscription {
  plan: PlanId;
  state: 'trialing' | 'active' | 'expired';
  billing_period: BillingPeriod | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  is_owner: boolean;
  /** Limits in force now (trials get Pro limits). */
  limits: Omit<Plan, 'monthly_price' | 'yearly_price' | 'sort_order'>;
  usage: {
    orders_this_month: number;
    team_members: number;
    ai_chat_today: number;
    insights_today: number;
    marketing_this_month: number;
  };
}

/** Whole days left until `iso`, never negative. */
export function daysUntil(iso: string | null, now = new Date()): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000));
}

/** End of the current trial or paid period. */
export function accessEndsAt(sub: Subscription): string | null {
  return sub.state === 'trialing' ? sub.trial_ends_at : sub.current_period_end;
}

/** Paid periods far in the future (e.g. founder accounts) show no end date. */
export function isOpenEnded(sub: Subscription) {
  const end = accessEndsAt(sub);
  return !!end && new Date(end).getFullYear() >= 2099;
}

export function planLabel(sub: Subscription) {
  if (sub.state === 'trialing') return 'Pro trial';
  return sub.plan === 'pro' ? 'Pro' : 'Starter';
}
