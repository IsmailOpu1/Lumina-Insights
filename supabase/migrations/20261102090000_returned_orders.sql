-- "Returned" order status.
--
-- A returned order went out and came back (common with cash on delivery):
--   * its units are back in stock, like a cancelled order;
--   * it is not a sale: no revenue and no product cost;
--   * the delivery and ad money spent on it is still lost, so its profit is
--     -(shipping_cost + ad_cost) and it still counts toward net profit;
--   * it still counts toward the monthly order limit (orders_this_month and
--     enforce_workspace_plan only skip 'Cancelled', so they need no change).

-- 1. Allow the status.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned'));

-- 2. Profit of a returned order is what it cost to send it.
create or replace function public.orders_before_write()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cost numeric;
  v_name text;
  v_keep_cost boolean := tg_op = 'INSERT' and new.import_id is not null and new.unit_cost is not null;
begin
  if tg_op = 'INSERT' and not (is_importing() and new.order_number is not null) then
    -- Assign the next number for this workspace; the lock serialises
    -- concurrent inserts so two orders can't get the same number.
    perform pg_advisory_xact_lock(hashtext('orders:' || new.owner_id::text));
    select 'ORD-' || lpad((coalesce(max((substring(order_number from '(\d+)'))::bigint), 0) + 1)::text, 3, '0')
      into new.order_number
      from orders
     where owner_id = new.owner_id;
  end if;

  if new.product_id is not null
     and (tg_op = 'INSERT' or new.product_id is distinct from old.product_id) then
    select cost_price, product_name into v_cost, v_name
      from inventory
     where id = new.product_id and owner_id = new.owner_id;
    if not found then
      raise exception 'product_not_in_workspace';
    end if;
    if not v_keep_cost then
      new.unit_cost := coalesce(v_cost, 0);
    end if;
    new.product_name := v_name;
  end if;
  new.unit_cost := coalesce(new.unit_cost, 0);

  if new.status = 'Returned' then
    -- The goods came back; only the delivery and ads were spent.
    new.profit_per_order := - new.shipping_cost - new.ad_cost;
  else
    new.profit_per_order := new.selling_price * new.quantity
                          - coalesce(new.unit_cost, 0) * new.quantity
                          - new.shipping_cost
                          - new.ad_cost;
  end if;
  return new;
end;
$function$;

-- 3. Returned orders hold no stock.
create or replace function public.orders_sync_stock()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_old_qty integer := 0;
  v_new_qty integer := 0;
  v_stock integer;
begin
  -- Cancelled, returned and imported orders hold no stock.
  if tg_op in ('UPDATE', 'DELETE') and old.status not in ('Cancelled', 'Returned') and old.import_id is null then
    v_old_qty := old.quantity;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.status not in ('Cancelled', 'Returned') and new.import_id is null then
    v_new_qty := new.quantity;
  end if;

  if tg_op = 'UPDATE' and old.product_id is not distinct from new.product_id then
    if v_old_qty <> v_new_qty and new.product_id is not null then
      update inventory set stock_quantity = stock_quantity + v_old_qty - v_new_qty
       where id = new.product_id
      returning stock_quantity into v_stock;
    end if;
  else
    if tg_op in ('UPDATE', 'DELETE') and old.product_id is not null and v_old_qty > 0 then
      update inventory set stock_quantity = stock_quantity + v_old_qty
       where id = old.product_id;
    end if;
    if tg_op in ('INSERT', 'UPDATE') and new.product_id is not null and v_new_qty > 0 then
      update inventory set stock_quantity = stock_quantity - v_new_qty
       where id = new.product_id
      returning stock_quantity into v_stock;
    end if;
  end if;

  if v_stock is not null and v_stock < 0 then
    raise exception 'insufficient_stock';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

-- 4. Tell the owner about returns too, under the same preference.
create or replace function public.notify_cancelled_order()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.status in ('Cancelled', 'Returned') and old.status is distinct from new.status
     and notification_enabled(new.owner_id, 'cancelled_order') then
    insert into notifications (type, title, message, owner_id)
    values ('cancelled_order',
            case new.status when 'Returned' then 'Order Returned' else 'Order Cancelled' end,
            'Order ' || new.order_number || ' from ' || new.customer_name
              || case new.status when 'Returned' then ' was returned' else ' was cancelled' end,
            new.owner_id);
  end if;
  return new;
end;
$function$;

-- 5. No low-margin alert for an order that was never a sale.
create or replace function public.notify_profit_drop()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_revenue numeric := new.selling_price * new.quantity;
  v_margin numeric;
begin
  if new.import_id is null and new.status not in ('Cancelled', 'Returned')
     and v_revenue > 0 and notification_enabled(new.owner_id, 'profit_drop') then
    v_margin := new.profit_per_order / v_revenue * 100;
    if v_margin < 10 then
      insert into notifications (type, title, message, owner_id)
      values ('profit_drop', 'Low Profit Margin Alert',
              'Order ' || new.order_number || ' has a low margin of ' || round(v_margin, 1) || '%',
              new.owner_id);
    end if;
  end if;
  return new;
end;
$function$;

-- 6. AI advisor numbers: returns are not sales, but their losses count.
create or replace function public.business_snapshot(p_from date default null::date, p_to date default null::date)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
as $function$
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
  a as (select * from o where status not in ('Cancelled', 'Returned')),
  r as (select * from o where status = 'Returned'),
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
  rt as (
    select count(*) as orders,
           coalesce(sum(profit_per_order), 0) as loss,
           coalesce(sum(ad_cost), 0) as ad
      from r
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
    'net_profit', round(t.order_profit + rt.loss - x.total, 2),
    'margin_pct', case when t.revenue > 0 then round((t.order_profit + rt.loss - x.total) / t.revenue * 100, 1) else 0 end,
    'orders', t.orders,
    'cancelled_orders', (select count(*) from o where status = 'Cancelled'),
    'returned_orders', rt.orders,
    'return_rate_pct', case when t.orders + rt.orders > 0 then round(rt.orders::numeric / (t.orders + rt.orders) * 100, 1) else 0 end,
    'return_losses', round(-rt.loss, 2),
    'expenses', round(x.total, 2),
    'ad_spend', round(t.order_ad + rt.ad + x.ad, 2),
    'roas', case when t.order_ad + rt.ad + x.ad > 0 then round(t.revenue / (t.order_ad + rt.ad + x.ad), 2) end,
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
  from t, rt, x;

  return v_result;
end;
$function$;

-- 7. Weekly summary: sales exclude returns, net profit includes their losses.
create or replace function public.generate_weekly_summaries()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

    select coalesce(sum(selling_price * quantity) filter (where status <> 'Returned'), 0),
           count(*) filter (where status <> 'Returned'),
           coalesce(sum(profit_per_order), 0)
      into v_rev, v_orders, v_profit
      from orders
     where owner_id = v_owner.user_id and status <> 'Cancelled'
       and date between current_date - 7 and current_date - 1;

    select coalesce(sum(selling_price * quantity), 0)
      into v_prev
      from orders
     where owner_id = v_owner.user_id and status not in ('Cancelled', 'Returned')
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
$function$;
