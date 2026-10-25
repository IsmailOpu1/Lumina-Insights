-- Phase 4 follow-ups: billing edge cases and plan limits.

------------------------------------------------------------------------------
-- 1 + 2. Payment activation
--   * Paying during a trial starts the paid period when the trial ends, so
--     no trial days are lost.
--   * A Starter payment made while Pro is still running (the app blocks
--     this; this is the backstop) keeps Pro instead of taking away Pro time
--     the customer already paid for.
------------------------------------------------------------------------------
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
  v_has_sub boolean;
  v_paid_running boolean;
  v_start timestamptz;
  v_plan text;
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
  v_has_sub := found;
  v_paid_running := v_has_sub and v_sub.status = 'active' and v_sub.current_period_end > now();

  v_start := case
               when v_paid_running then v_sub.current_period_end
               when v_has_sub and v_sub.status = 'trialing' and v_sub.trial_ends_at > now() then v_sub.trial_ends_at
               else now()
             end;

  v_plan := case
              when v_paid_running and v_sub.plan = 'pro' and v_pay.plan = 'starter' then 'pro'
              else v_pay.plan
            end;

  insert into subscriptions (owner_id, plan, status, billing_period, current_period_end, updated_at)
  values (v_pay.owner_id, v_plan, 'active', v_pay.billing_period,
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
-- 3. Give an AI use back when the AI call itself failed. Service role only:
--    letting users call it would let them undo their own usage.
------------------------------------------------------------------------------
create or replace function public.refund_ai_quota(p_user uuid, p_metric text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_period date;
begin
  select case when role = 'owner' or owner_id is null then user_id else owner_id end
    into v_owner
    from user_settings where user_id = p_user;
  v_owner := coalesce(v_owner, p_user);

  v_period := case when p_metric = 'marketing'
                   then date_trunc('month', dhaka_today())::date
                   else dhaka_today() end;

  update usage_counters
     set used = used - 1
   where owner_id = v_owner and metric = p_metric and period_start = v_period and used > 0;
end;
$$;

revoke execute on function public.refund_ai_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_ai_quota(uuid, text) to service_role;

------------------------------------------------------------------------------
-- 6. Cancelled orders don't count toward the monthly order limit; bringing
--    a cancelled order back counts it again.
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
  v_counts boolean := false;  -- does this write add an order to the monthly count?
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

  -- Nested so order columns are only read on the orders table.
  if tg_table_name = 'orders' and v_state = 'active' then
    if new.status <> 'Cancelled' then
      if tg_op = 'INSERT' then
        v_counts := true;
      else
        v_counts := old.status = 'Cancelled';
      end if;
    end if;

    if v_counts then
      select max_orders_per_month into v_max from plans where id = v_plan;
      if v_max is not null then
        select count(*) into v_count
          from orders
         where owner_id = new.owner_id
           and status <> 'Cancelled'
           and (created_at at time zone 'Asia/Dhaka')::date >= date_trunc('month', dhaka_today())::date;
        if v_count >= v_max then
          raise exception 'plan_limit_orders';
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

------------------------------------------------------------------------------
-- 8. Team members only have access while the workspace is on Pro (trials
--    are Pro). On Starter they are suspended, not removed: upgrading brings
--    them back.
------------------------------------------------------------------------------
create or replace function public.has_workspace_access(target_owner uuid, require_write boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_owner = auth.uid()
     or (
       exists (
         select 1 from team_members tm
          where tm.owner_id = target_owner
            and tm.member_id = auth.uid()
            and tm.status = 'active'
            and (not require_write or tm.role <> 'viewer')
       )
       and exists (
         select 1 from subscriptions s
          where s.owner_id = target_owner and s.plan = 'pro'
       )
     );
$$;

------------------------------------------------------------------------------
-- Subscription summary: monthly order usage excludes cancelled orders (6),
-- and members can see whether their access is suspended (8).
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
    'member_access_suspended', v_owner <> auth.uid() and v_sub.plan <> 'pro',
    'limits', (select to_jsonb(p) - 'monthly_price' - 'yearly_price' - 'sort_order'
                 from plans p where p.id = v_limits_plan),
    'usage', jsonb_build_object(
      'orders_this_month', (select count(*) from orders
                             where owner_id = v_owner
                               and status <> 'Cancelled'
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
