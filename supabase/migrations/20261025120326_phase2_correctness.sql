-- Phase 2 correctness:
--   * business_snapshot(): one server-side source of business numbers for AI
--   * per-user notification read/dismiss state
--   * weekly summary notifications (pg_cron)
--   * low-stock alert uses the same "below threshold" rule as the UI

------------------------------------------------------------------------------
-- 1. Low stock = stock below the threshold (matches every screen in the app)
------------------------------------------------------------------------------
create or replace function public.notify_low_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stock_quantity = 0 and old.stock_quantity > 0 then
    if notification_enabled(new.owner_id, 'critical_stock') then
      insert into notifications (type, title, message, owner_id)
      values ('critical_stock', 'Critical Stock Alert',
              new.product_name || ' is out of stock!', new.owner_id);
    end if;
  elsif new.stock_quantity < new.low_stock_threshold
        and old.stock_quantity >= old.low_stock_threshold then
    if notification_enabled(new.owner_id, 'low_stock') then
      insert into notifications (type, title, message, owner_id)
      values ('low_stock', 'Low Stock Alert',
              new.product_name || ' is running low (' || new.stock_quantity || ' units left)',
              new.owner_id);
    end if;
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------
-- 2. Business snapshot for the caller's workspace
------------------------------------------------------------------------------
-- SECURITY INVOKER: row level security still applies, so a caller can only
-- ever summarise data they are allowed to read. Profit uses the same formula
-- as the dashboard: per-order profit of non-cancelled orders minus expenses.
create or replace function public.business_snapshot(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_type text;
  v_description text;
  v_currency text;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select case when s.role = 'owner' or s.owner_id is null then s.user_id else s.owner_id end
    into v_owner
    from user_settings s
   where s.user_id = v_uid;
  v_owner := coalesce(v_owner, v_uid);

  select business_name, business_type, business_description, currency
    into v_name, v_type, v_description, v_currency
    from user_settings
   where user_id = v_owner;

  with
  o as (
    select * from orders
     where owner_id = v_owner
       and (p_from is null or date >= p_from)
       and (p_to is null or date <= p_to)
  ),
  a as (select * from o where status <> 'Cancelled'),
  e as (
    select * from expenses
     where owner_id = v_owner
       and (p_from is null or date >= p_from)
       and (p_to is null or date <= p_to)
  ),
  inv as (select * from inventory where owner_id = v_owner),
  t as (
    select coalesce(sum(selling_price * quantity), 0) as revenue,
           coalesce(sum(profit_per_order), 0) as order_profit,
           coalesce(sum(ad_cost), 0) as order_ad,
           count(*) as orders
      from a
  ),
  x as (
    select coalesce(sum(amount), 0) as total,
           coalesce(sum(amount) filter (where type = 'Ad Spend'), 0) as ad
      from e
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', coalesce(p_to, current_date)),
    'business', jsonb_build_object(
      'name', v_name,
      'type', v_type,
      'description', v_description,
      'currency', coalesce(v_currency, 'BDT')
    ),
    'revenue', round(t.revenue, 2),
    'net_profit', round(t.order_profit - x.total, 2),
    'margin_pct', case when t.revenue > 0 then round((t.order_profit - x.total) / t.revenue * 100, 1) else 0 end,
    'orders', t.orders,
    'cancelled_orders', (select count(*) from o where status = 'Cancelled'),
    'expenses', round(x.total, 2),
    'ad_spend', round(t.order_ad + x.ad, 2),
    'roas', case when t.order_ad + x.ad > 0 then round(t.revenue / (t.order_ad + x.ad), 2) end,
    'top_products', coalesce((
      select jsonb_agg(p order by p.units desc)
        from (
          select coalesce(i.product_name, a.product_name, 'Unknown') as name,
                 sum(a.quantity) as units,
                 round(sum(a.selling_price * a.quantity), 2) as revenue,
                 round(sum(a.profit_per_order), 2) as profit
            from a left join inv i on i.id = a.product_id
           group by 1
           order by units desc
           limit 5
        ) p
    ), '[]'::jsonb),
    'sales_by_channel', coalesce((
      select jsonb_agg(c order by c.revenue desc)
        from (
          select coalesce(source, 'Unknown') as channel,
                 count(*) as orders,
                 round(sum(selling_price * quantity), 2) as revenue
            from a
           group by 1
        ) c
    ), '[]'::jsonb),
    'low_stock', coalesce((
      select jsonb_agg(l)
        from (
          select product_name as name, stock_quantity as stock, low_stock_threshold as threshold
            from inv
           where stock_quantity < low_stock_threshold
           order by stock_quantity
           limit 20
        ) l
    ), '[]'::jsonb),
    'inventory', jsonb_build_object(
      'products', (select count(*) from inv),
      'value', (select round(coalesce(sum(stock_quantity * cost_price), 0), 2) from inv)
    ),
    -- Most recent 60 days that had orders, oldest first.
    'daily', coalesce((
      select jsonb_agg(d order by d.date)
        from (
          select date,
                 count(*) as orders,
                 round(sum(selling_price * quantity), 2) as revenue,
                 round(sum(profit_per_order), 2) as profit
            from a
           group by date
           order by date desc
           limit 60
        ) d
    ), '[]'::jsonb)
  )
  into v_result
  from t, x;

  return v_result;
end;
$$;

revoke execute on function public.business_snapshot(date, date) from public, anon;
grant execute on function public.business_snapshot(date, date) to authenticated;

------------------------------------------------------------------------------
-- 3. Per-user notification state
------------------------------------------------------------------------------
-- Notifications belong to the workspace; whether one is read or dismissed
-- belongs to each person. Viewers could not mark notifications read before
-- (they have no write access to the workspace), and "clear all" deleted them
-- for the whole team.
create table if not exists public.notification_states (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  read_at timestamptz,
  dismissed_at timestamptz,
  primary key (notification_id, user_id)
);

create index if not exists idx_notification_states_user on public.notification_states (user_id);

alter table public.notification_states enable row level security;

drop policy if exists notification_states_own on public.notification_states;
create policy notification_states_own on public.notification_states
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.notifications n where n.id = notification_id)
  );

create or replace view public.my_notifications
with (security_invoker = true) as
  select n.id,
         n.type,
         n.title,
         n.message,
         n.created_at,
         n.owner_id,
         (s.read_at is not null) as is_read
    from public.notifications n
    left join public.notification_states s
      on s.notification_id = n.id and s.user_id = auth.uid()
   where s.dismissed_at is null;

revoke all on public.my_notifications from anon;
grant select on public.my_notifications to authenticated;

-- p_ids null = every notification the caller can see.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into notification_states (notification_id, user_id, read_at)
  select n.id, auth.uid(), now()
    from notifications n
   where p_ids is null or n.id = any(p_ids)
  on conflict (notification_id, user_id)
    do update set read_at = coalesce(notification_states.read_at, excluded.read_at);
$$;

create or replace function public.dismiss_notifications(p_ids uuid[] default null)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into notification_states (notification_id, user_id, read_at, dismissed_at)
  select n.id, auth.uid(), now(), now()
    from notifications n
   where p_ids is null or n.id = any(p_ids)
  on conflict (notification_id, user_id)
    do update set read_at = coalesce(notification_states.read_at, excluded.read_at),
                  dismissed_at = coalesce(notification_states.dismissed_at, excluded.dismissed_at);
$$;

revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
revoke execute on function public.dismiss_notifications(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.dismiss_notifications(uuid[]) to authenticated;

------------------------------------------------------------------------------
-- 4. Weekly summary (Mondays 09:00 Dhaka = 03:00 UTC)
------------------------------------------------------------------------------
create extension if not exists pg_cron;

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
    select user_id from user_settings
     where role = 'owner' and onboarding_complete and user_id is not null
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

revoke execute on function public.generate_weekly_summaries() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'lumina-weekly-summary';
  perform cron.schedule('lumina-weekly-summary', '0 3 * * 1', 'select public.generate_weekly_summaries()');
end $$;
