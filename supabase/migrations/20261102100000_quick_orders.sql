-- Faster order entry.
--
-- 1. Orders keep the customer's phone and address. They are the first things
--    a Messenger or WhatsApp order contains, a phone number finds a returning
--    customer, and couriers need both. Optional, so old orders stay valid.
-- 2. Reading an order from a pasted chat or screenshot uses AI, so it gets
--    its own daily counter ('order_reader'). The limit is a guard against
--    runaway use, set well above what a busy shop needs, and kept separate
--    from the AI assistant's questions so one never eats into the other.

-- 1. Phone and address.
alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists customer_address text;
alter table public.orders drop constraint if exists orders_customer_phone_length;
alter table public.orders add constraint orders_customer_phone_length
  check (customer_phone is null or char_length(customer_phone) <= 30);
alter table public.orders drop constraint if exists orders_customer_address_length;
alter table public.orders add constraint orders_customer_address_length
  check (customer_address is null or char_length(customer_address) <= 500);

-- Looking up a returning customer by phone.
create index if not exists orders_owner_phone_idx
  on public.orders (owner_id, customer_phone)
  where customer_phone is not null;

-- 2. Order reading limit per plan (null = unlimited).
alter table public.plans add column if not exists order_reads_per_day integer default 500;
update public.plans set order_reads_per_day = 500 where order_reads_per_day is null;

alter table public.usage_counters drop constraint if exists usage_counters_metric_check;
alter table public.usage_counters add constraint usage_counters_metric_check
  check (metric in ('ai_chat', 'insights', 'marketing', 'order_reader'));

create or replace function public.consume_ai_quota(p_metric text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  if p_metric not in ('ai_chat', 'insights', 'marketing', 'order_reader') then
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
           when 'order_reader' then order_reads_per_day
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
$function$;
