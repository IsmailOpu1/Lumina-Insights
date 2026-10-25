-- Phase 4: plans, 14-day trials, subscriptions, payments and plan limits.
-- Limits are enforced here so they hold no matter how the API is called.

------------------------------------------------------------------------------
-- 1. Plans (single source of truth for prices and limits)
------------------------------------------------------------------------------
create table if not exists public.plans (
  id text primary key,
  name text not null,
  monthly_price numeric not null,
  yearly_price numeric not null,
  max_orders_per_month integer,        -- null = unlimited
  max_team_members integer not null,   -- not counting the owner
  ai_chat_per_day integer not null,
  insights_per_day integer not null,
  marketing_per_month integer,         -- null = unlimited
  weekly_summary boolean not null,
  data_export boolean not null,
  sort_order integer not null
);

insert into public.plans (id, name, monthly_price, yearly_price, max_orders_per_month, max_team_members,
                          ai_chat_per_day, insights_per_day, marketing_per_month, weekly_summary, data_export, sort_order)
values
  ('starter', 'Starter', 499, 4990, 300, 0, 20, 10, 30, false, false, 1),
  ('pro', 'Pro', 1499, 14990, null, 5, 100, 30, null, true, true, 2)
on conflict (id) do update set
  name = excluded.name,
  monthly_price = excluded.monthly_price,
  yearly_price = excluded.yearly_price,
  max_orders_per_month = excluded.max_orders_per_month,
  max_team_members = excluded.max_team_members,
  ai_chat_per_day = excluded.ai_chat_per_day,
  insights_per_day = excluded.insights_per_day,
  marketing_per_month = excluded.marketing_per_month,
  weekly_summary = excluded.weekly_summary,
  data_export = excluded.data_export,
  sort_order = excluded.sort_order;

alter table public.plans enable row level security;
drop policy if exists plans_public_read on public.plans;
-- Prices are public (the landing page shows them).
create policy plans_public_read on public.plans for select to anon, authenticated using (true);

------------------------------------------------------------------------------
-- 2. Subscriptions, payments, usage
------------------------------------------------------------------------------
create table if not exists public.subscriptions (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'pro' references public.plans(id),
  status text not null default 'trialing' check (status in ('trialing', 'active')),
  billing_period text check (billing_period in ('monthly', 'yearly')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_workspace_read on public.subscriptions;
-- Read-only for the workspace; only server-side functions change it.
create policy subscriptions_workspace_read on public.subscriptions
  for select to authenticated using (public.has_workspace_access(owner_id, false));

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  tran_id text not null unique,
  plan text not null references public.plans(id),
  billing_period text not null check (billing_period in ('monthly', 'yearly')),
  amount numeric not null,
  currency text not null default 'BDT',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  val_id text,
  card_type text,
  gateway_response jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_payments_owner on public.payments (owner_id, created_at desc);

alter table public.payments enable row level security;
drop policy if exists payments_owner_read on public.payments;
create policy payments_owner_read on public.payments
  for select to authenticated using (owner_id = auth.uid());

create table if not exists public.usage_counters (
  owner_id uuid not null references auth.users(id) on delete cascade,
  metric text not null check (metric in ('ai_chat', 'insights', 'marketing')),
  period_start date not null,
  used integer not null default 0,
  primary key (owner_id, metric, period_start)
);

alter table public.usage_counters enable row level security;
drop policy if exists usage_workspace_read on public.usage_counters;
create policy usage_workspace_read on public.usage_counters
  for select to authenticated using (public.has_workspace_access(owner_id, false));

------------------------------------------------------------------------------
-- 3. Helpers
------------------------------------------------------------------------------
-- The workspace the signed-in user works in (their own, or their owner's).
create or replace function public.current_workspace_owner()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case when role = 'owner' or owner_id is null then user_id else owner_id end
       from user_settings where user_id = auth.uid()),
    auth.uid());
$$;

-- Today in Bangladesh; daily limits reset at Dhaka midnight.
create or replace function public.dhaka_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Dhaka')::date;
$$;

-- Effective plan for a workspace. A lapsed trial or subscription is
-- 'expired' (read-only). Trials get Pro limits.
create or replace function public.workspace_plan(p_owner uuid)
returns table (plan_id text, state text)
language sql
stable
security definer
set search_path = public
as $$
  select s.plan,
         case
           when s.status = 'trialing' and s.trial_ends_at > now() then 'trialing'
           when s.status = 'active' and s.current_period_end > now() then 'active'
           else 'expired'
         end
    from subscriptions s
   where s.owner_id = p_owner;
$$;

------------------------------------------------------------------------------
-- 4. Trials start when an owner's profile is first saved (onboarding step 3),
--    so invites sent during onboarding already have a plan to count against.
------------------------------------------------------------------------------
create or replace function public.start_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'owner' and new.user_id is not null then
    insert into subscriptions (owner_id, plan, status, trial_ends_at)
    values (new.user_id, 'pro', 'trialing', now() + interval '14 days')
    on conflict (owner_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_start_trial on public.user_settings;
create trigger trg_start_trial
  after insert or update of role on public.user_settings
  for each row execute function public.start_trial();

-- Workspaces created before billing launched keep full access; owners who
-- were part-way through onboarding get the normal trial.
insert into public.subscriptions (owner_id, plan, status, billing_period, current_period_end)
select user_id, 'pro', 'active', 'yearly', '2100-01-01'::timestamptz
  from public.user_settings
 where role = 'owner' and onboarding_complete and user_id is not null
on conflict (owner_id) do nothing;

insert into public.subscriptions (owner_id, plan, status, trial_ends_at)
select user_id, 'pro', 'trialing', now() + interval '14 days'
  from public.user_settings
 where role = 'owner' and user_id is not null
on conflict (owner_id) do nothing;

------------------------------------------------------------------------------
-- 5. Enforcement: read-only when expired, monthly order cap, team size
------------------------------------------------------------------------------
create or replace function public.enforce_workspace_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_state text;
  v_max integer;
  v_count integer;
begin
  -- Only writes made by signed-in users are checked; payment activation,
  -- scheduled jobs and admin fixes run without a user.
  if auth.uid() is null then
    return new;
  end if;

  select plan_id, state into v_plan, v_state from workspace_plan(new.owner_id);
  if v_state is null or v_state = 'expired' then
    raise exception 'subscription_inactive';
  end if;

  if tg_table_name = 'orders' and tg_op = 'INSERT' and v_state = 'active' then
    select max_orders_per_month into v_max from plans where id = v_plan;
    if v_max is not null then
      select count(*) into v_count
        from orders
       where owner_id = new.owner_id
         and (created_at at time zone 'Asia/Dhaka')::date >= date_trunc('month', dhaka_today())::date;
      if v_count >= v_max then
        raise exception 'plan_limit_orders';
      end if;
    end if;
  end if;

  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['orders', 'inventory', 'expenses', 'notes', 'marketing_outputs']
  loop
    execute format('drop trigger if exists trg_enforce_workspace_plan on public.%I', t);
    execute format('create trigger trg_enforce_workspace_plan before insert or update on public.%I
                    for each row execute function public.enforce_workspace_plan()', t);
  end loop;
end $$;

create or replace function public.enforce_team_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_state text;
  v_max integer;
  v_used integer;
begin
  select plan_id, state into v_plan, v_state from workspace_plan(new.owner_id);
  if v_state is null or v_state = 'expired' then
    raise exception 'subscription_inactive';
  end if;

  -- Trials get Pro limits.
  select max_team_members into v_max
    from plans where id = case when v_state = 'trialing' then 'pro' else v_plan end;

  select (select count(*) from team_members where owner_id = new.owner_id)
       + (select count(*) from invites
           where owner_id = new.owner_id and not coalesce(used, false) and expires_at > now())
    into v_used;

  if v_used >= v_max then
    raise exception 'plan_limit_team';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_team_limit on public.invites;
create trigger trg_enforce_team_limit
  before insert on public.invites
  for each row execute function public.enforce_team_limit();

------------------------------------------------------------------------------
-- 6. AI quotas
------------------------------------------------------------------------------
-- Called by the AI edge functions (as the user) before calling Gemini.
-- Returns how many uses remain in the current period.
create or replace function public.consume_ai_quota(p_metric text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := current_workspace_owner();
  v_plan text;
  v_state text;
  v_limit integer;
  v_period date;
  v_used integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_metric not in ('ai_chat', 'insights', 'marketing') then
    raise exception 'unknown_metric';
  end if;

  select plan_id, state into v_plan, v_state from workspace_plan(v_owner);
  if v_state is null or v_state = 'expired' then
    raise exception 'subscription_inactive';
  end if;
  if v_state = 'trialing' then
    v_plan := 'pro';
  end if;

  select case p_metric
           when 'ai_chat' then ai_chat_per_day
           when 'insights' then insights_per_day
           when 'marketing' then marketing_per_month
         end
    into v_limit
    from plans where id = v_plan;

  v_period := case when p_metric = 'marketing'
                   then date_trunc('month', dhaka_today())::date
                   else dhaka_today() end;

  insert into usage_counters as u (owner_id, metric, period_start, used)
  values (v_owner, p_metric, v_period, 1)
  on conflict (owner_id, metric, period_start)
    do update set used = u.used + 1
    where v_limit is null or u.used < v_limit
  returning u.used into v_used;

  if v_used is null then
    raise exception 'plan_limit_%', p_metric;
  end if;

  return case when v_limit is null then null else v_limit - v_used end;
end;
$$;

------------------------------------------------------------------------------
-- 7. Subscription summary for the app
------------------------------------------------------------------------------
create or replace function public.get_my_subscription()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid := current_workspace_owner();
  v_sub subscriptions%rowtype;
  v_state text;
  v_limits_plan text;
  v_month date := date_trunc('month', dhaka_today())::date;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_sub from subscriptions where owner_id = v_owner;
  if not found then
    return null;
  end if;

  select state into v_state from workspace_plan(v_owner);
  v_limits_plan := case when v_state = 'trialing' then 'pro' else v_sub.plan end;

  return jsonb_build_object(
    'plan', v_sub.plan,
    'state', v_state,
    'billing_period', v_sub.billing_period,
    'trial_ends_at', v_sub.trial_ends_at,
    'current_period_end', v_sub.current_period_end,
    'is_owner', v_owner = auth.uid(),
    'limits', (select to_jsonb(p) - 'monthly_price' - 'yearly_price' - 'sort_order'
                 from plans p where p.id = v_limits_plan),
    'usage', jsonb_build_object(
      'orders_this_month', (select count(*) from orders
                             where owner_id = v_owner
                               and (created_at at time zone 'Asia/Dhaka')::date >= v_month),
      'team_members', (select count(*) from team_members where owner_id = v_owner)
                    + (select count(*) from invites
                        where owner_id = v_owner and not coalesce(used, false) and expires_at > now()),
      'ai_chat_today', coalesce((select used from usage_counters
                                  where owner_id = v_owner and metric = 'ai_chat' and period_start = dhaka_today()), 0),
      'insights_today', coalesce((select used from usage_counters
                                   where owner_id = v_owner and metric = 'insights' and period_start = dhaka_today()), 0),
      'marketing_this_month', coalesce((select used from usage_counters
                                         where owner_id = v_owner and metric = 'marketing' and period_start = v_month), 0)
    )
  );
end;
$$;

------------------------------------------------------------------------------
-- 8. Payment activation (called by the payment edge functions only)
------------------------------------------------------------------------------
-- Marks a validated payment paid and extends the subscription. Idempotent:
-- the IPN and the browser return can both arrive for the same payment.
create or replace function public.activate_payment(
  p_tran_id text, p_val_id text, p_amount numeric, p_card_type text, p_response jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay payments%rowtype;
  v_sub subscriptions%rowtype;
  v_start timestamptz;
begin
  select * into v_pay from payments where tran_id = p_tran_id for update;
  if not found then
    raise exception 'payment_not_found';
  end if;
  if v_pay.status = 'paid' then
    return 'already_paid';
  end if;
  if p_amount <> v_pay.amount then
    raise exception 'amount_mismatch';
  end if;

  update payments
     set status = 'paid', val_id = p_val_id, card_type = p_card_type,
         gateway_response = p_response, paid_at = now()
   where id = v_pay.id;

  select * into v_sub from subscriptions where owner_id = v_pay.owner_id for update;
  -- Paying while a paid period is still running extends it; otherwise the
  -- new period starts now (a remaining trial is not carried over).
  v_start := case
               when found and v_sub.status = 'active' and v_sub.current_period_end > now()
               then v_sub.current_period_end
               else now()
             end;

  insert into subscriptions (owner_id, plan, status, billing_period, current_period_end, updated_at)
  values (v_pay.owner_id, v_pay.plan, 'active', v_pay.billing_period,
          v_start + case v_pay.billing_period when 'yearly' then interval '1 year' else interval '1 month' end,
          now())
  on conflict (owner_id) do update
    set plan = excluded.plan,
        status = 'active',
        billing_period = excluded.billing_period,
        current_period_end = excluded.current_period_end,
        updated_at = now();

  return 'activated';
end;
$$;

------------------------------------------------------------------------------
-- 9. Weekly summaries are a Pro feature
------------------------------------------------------------------------------
create or replace function public.generate_weekly_summaries()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner record;
  v_rev numeric;
  v_prev numeric;
  v_orders integer;
  v_profit numeric;
  v_expenses numeric;
  v_sym text;
  v_trend text;
  v_sent integer := 0;
begin
  for v_owner in
    select us.user_id
      from user_settings us
      join lateral workspace_plan(us.user_id) wp on true
     where us.role = 'owner' and us.onboarding_complete and us.user_id is not null
       and (wp.state = 'trialing' or (wp.state = 'active' and wp.plan_id = 'pro'))
  loop
    continue when not notification_enabled(v_owner.user_id, 'weekly_summary');

    select coalesce(sum(selling_price * quantity), 0), count(*), coalesce(sum(profit_per_order), 0)
      into v_rev, v_orders, v_profit
      from orders
     where owner_id = v_owner.user_id and status <> 'Cancelled'
       and date between current_date - 7 and current_date - 1;

    select coalesce(sum(selling_price * quantity), 0)
      into v_prev
      from orders
     where owner_id = v_owner.user_id and status <> 'Cancelled'
       and date between current_date - 14 and current_date - 8;

    -- Nothing to report for an inactive workspace.
    continue when v_orders = 0 and v_prev = 0;

    select coalesce(sum(amount), 0)
      into v_expenses
      from expenses
     where owner_id = v_owner.user_id
       and date between current_date - 7 and current_date - 1;

    v_sym := currency_symbol(v_owner.user_id);
    v_trend := case
      when v_prev = 0 then ''
      when v_rev >= v_prev then ' (up ' || round((v_rev - v_prev) / v_prev * 100) || '% vs the week before)'
      else ' (down ' || round((v_prev - v_rev) / v_prev * 100) || '% vs the week before)'
    end;

    insert into notifications (type, title, message, owner_id)
    values ('weekly_summary', 'Weekly Summary',
            'Last 7 days: ' || v_sym || to_char(round(v_rev), 'FM999,999,999,990') || ' revenue from '
              || v_orders || ' order' || case when v_orders = 1 then '' else 's' end
              || ', ' || v_sym || to_char(round(v_profit - v_expenses), 'FM999,999,999,990') || ' net profit'
              || v_trend || '.',
            v_owner.user_id);
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$$;

------------------------------------------------------------------------------
-- 10. Privileges
------------------------------------------------------------------------------
revoke execute on function public.current_workspace_owner() from public, anon, authenticated;
revoke execute on function public.workspace_plan(uuid) from public, anon, authenticated;
revoke execute on function public.start_trial() from public, anon, authenticated;
revoke execute on function public.enforce_workspace_plan() from public, anon, authenticated;
revoke execute on function public.enforce_team_limit() from public, anon, authenticated;
revoke execute on function public.consume_ai_quota(text) from public, anon;
revoke execute on function public.get_my_subscription() from public, anon;
revoke execute on function public.activate_payment(text, text, numeric, text, jsonb) from public, anon, authenticated;
revoke execute on function public.generate_weekly_summaries() from public, anon, authenticated;

grant execute on function public.consume_ai_quota(text) to authenticated;
grant execute on function public.get_my_subscription() to authenticated;
grant execute on function public.activate_payment(text, text, numeric, text, jsonb) to service_role;
