-- Importing existing records from Excel / CSV.
--
-- An import runs in one transaction through import_business_data, so it
-- either all lands or none of it does. Imported orders are history: they
-- don't move stock, don't raise per-order alerts, and count toward the
-- plan's monthly limit by the month they happened, not the day they were
-- imported. Normal writes behave exactly as before.

-- 1. Import log, used for history and undo.
create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  file_name text not null,
  counts jsonb not null default '{}'::jsonb,
  -- Previous values of products the import changed, so undo can put them back.
  inventory_before jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists idx_imports_owner on public.imports (owner_id, created_at desc);

alter table public.imports enable row level security;
drop policy if exists imports_workspace_read on public.imports;
create policy imports_workspace_read on public.imports
  for select to authenticated using (has_workspace_access(owner_id, false));
-- Only import_business_data and undo_import write here.
revoke insert, update, delete on public.imports from anon, authenticated;

-- 2. Link records to the import that created them.
alter table public.orders    add column if not exists import_id uuid references public.imports(id) on delete set null;
alter table public.orders    add column if not exists external_ref text;
alter table public.inventory add column if not exists import_id uuid references public.imports(id) on delete set null;
alter table public.expenses  add column if not exists import_id uuid references public.imports(id) on delete set null;
create index if not exists idx_orders_import    on public.orders (import_id) where import_id is not null;
create index if not exists idx_inventory_import on public.inventory (import_id) where import_id is not null;
create index if not exists idx_expenses_import  on public.expenses (import_id) where import_id is not null;
create index if not exists idx_orders_owner_external_ref on public.orders (owner_id, external_ref) where external_ref is not null;

-- import_id changes how a row is treated (no stock, different plan count),
-- so only the import functions may set it. Direct API writes keep it as is.
create or replace function public.guard_import_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.import_id := case when tg_op = 'INSERT' then null else old.import_id end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_import_id on public.orders;
create trigger trg_guard_import_id before insert or update on public.orders
  for each row execute function public.guard_import_id();
drop trigger if exists trg_guard_import_id on public.inventory;
create trigger trg_guard_import_id before insert or update on public.inventory
  for each row execute function public.guard_import_id();
drop trigger if exists trg_guard_import_id on public.expenses;
create trigger trg_guard_import_id before insert or update on public.expenses
  for each row execute function public.guard_import_id();

-- True only inside import_business_data / undo_import.
create or replace function public.is_importing()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(current_setting('lumina.importing', true), '') = 'on';
$$;

-- 3. Order numbering and cost. Imports assign their own block of numbers
--    (one lookup instead of one per row) and keep the cost from the file,
--    since today's product cost would rewrite historical profit.
create or replace function public.orders_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

  new.profit_per_order := new.selling_price * new.quantity
                        - coalesce(new.unit_cost, 0) * new.quantity
                        - new.shipping_cost
                        - new.ad_cost;
  return new;
end;
$$;

-- 4. Stock. Imported orders never took stock, so creating, editing,
--    cancelling or deleting them must not give any back either.
create or replace function public.orders_sync_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_qty integer := 0;
  v_new_qty integer := 0;
  v_stock integer;
begin
  -- Cancelled and imported orders hold no stock.
  if tg_op in ('UPDATE', 'DELETE') and old.status <> 'Cancelled' and old.import_id is null then
    v_old_qty := old.quantity;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.status <> 'Cancelled' and new.import_id is null then
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
$$;

-- 5. Per-order alerts are for new orders, not imported history.
create or replace function public.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.import_id is null and notification_enabled(new.owner_id, 'new_order') then
    insert into notifications (type, title, message, owner_id)
    values ('new_order', 'New Order Received',
            'Order ' || new.order_number || ' from ' || new.customer_name || ' for '
              || currency_symbol(new.owner_id) || round(new.selling_price * new.quantity),
            new.owner_id);
  end if;
  return new;
end;
$$;

create or replace function public.notify_profit_drop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revenue numeric := new.selling_price * new.quantity;
  v_margin numeric;
begin
  if new.import_id is null and v_revenue > 0 and notification_enabled(new.owner_id, 'profit_drop') then
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
$$;

create or replace function public.notify_roas_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold numeric;
  v_roas numeric;
begin
  if new.import_id is null and new.ad_cost > 0 and notification_enabled(new.owner_id, 'roas_alert') then
    select coalesce(roas_threshold, 2) into v_threshold
      from user_settings where user_id = new.owner_id;
    v_threshold := coalesce(v_threshold, 2);
    v_roas := new.selling_price * new.quantity / new.ad_cost;
    if v_roas < v_threshold then
      insert into notifications (type, title, message, owner_id)
      values ('roas_alert', 'Low ROAS Alert',
              'Order ' || new.order_number || ' has ROAS of ' || round(v_roas, 1)
                || 'x (below ' || round(v_threshold, 1) || 'x threshold)',
              new.owner_id);
    end if;
  end if;
  return new;
end;
$$;

-- Stock set by an import is a starting point, not a drop worth alerting on.
create or replace function public.notify_low_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_importing() then
    return new;
  end if;
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

-- 6. Plan limits. Orders count toward the month they happened in when
--    imported, and the month they were entered otherwise. The import
--    function checks the limit once for the whole file.
create or replace function public.orders_this_month(p_owner uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
    from orders
   where owner_id = p_owner
     and status <> 'Cancelled'
     and case when import_id is null
              then (created_at at time zone 'Asia/Dhaka')::date
              else date
         end >= date_trunc('month', dhaka_today())::date;
$$;
revoke execute on function public.orders_this_month(uuid) from public, anon, authenticated;

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
  v_counts boolean := false;  -- does this write add an order to the monthly count?
begin
  -- Only writes made by signed-in users are checked; payment activation,
  -- scheduled jobs and admin fixes run without a user. Imports check the
  -- plan once for the whole file.
  if auth.uid() is null or is_importing() then
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
      if v_max is not null and orders_this_month(new.owner_id) >= v_max then
        raise exception 'plan_limit_orders';
      end if;
    end if;
  end if;

  return new;
end;
$$;

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
      'orders_this_month', orders_this_month(v_owner),
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

-- 7. The import itself. Rows arrive already cleaned by the app; the
--    database still owns every rule that matters (whose workspace, who may
--    import, plan state and limits, duplicates, numbering).
create or replace function public.import_business_data(
  p_file_name text,
  p_inventory jsonb default '[]'::jsonb,
  p_orders jsonb default '[]'::jsonb,
  p_expenses jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_rows constant integer := 5000;
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_plan text;
  v_state text;
  v_max integer;
  v_import uuid;
  v_next bigint;
  r jsonb;
  v_existing inventory%rowtype;
  v_before jsonb := '[]'::jsonb;
  v_name text;
  v_sku text;
  v_ref text;
  v_date date;
  v_product uuid;
  v_inv_created integer := 0;
  v_inv_updated integer := 0;
  v_ord_created integer := 0;
  v_ord_skipped integer := 0;
  v_exp_created integer := 0;
  v_exp_skipped integer := 0;
  v_counts jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  v_owner := current_workspace_owner();
  -- Owners and managers only; viewers are read-only.
  if not has_workspace_access(v_owner, true) then
    raise exception 'import_not_allowed';
  end if;

  select plan_id, state into v_plan, v_state from workspace_plan(v_owner);
  if v_state is null or v_state = 'expired' then
    raise exception 'subscription_inactive';
  end if;

  if jsonb_typeof(coalesce(p_inventory, '[]')) <> 'array'
     or jsonb_typeof(coalesce(p_orders, '[]')) <> 'array'
     or jsonb_typeof(coalesce(p_expenses, '[]')) <> 'array' then
    raise exception 'import_invalid';
  end if;
  if jsonb_array_length(coalesce(p_inventory, '[]')) > c_max_rows
     or jsonb_array_length(coalesce(p_orders, '[]')) > c_max_rows
     or jsonb_array_length(coalesce(p_expenses, '[]')) > c_max_rows then
    raise exception 'import_too_large';
  end if;

  perform set_config('lumina.importing', 'on', true);

  insert into imports (owner_id, created_by, file_name)
  values (v_owner, v_uid, left(coalesce(nullif(trim(p_file_name), ''), 'Imported file'), 200))
  returning id into v_import;

  -- Products: update the matching product (by SKU, then name) or add it.
  for r in select * from jsonb_array_elements(coalesce(p_inventory, '[]'))
  loop
    v_name := left(trim(coalesce(r->>'product_name', '')), 200);
    continue when v_name = '';
    v_sku := nullif(left(trim(coalesce(r->>'sku', '')), 100), '');

    select * into v_existing
      from inventory
     where owner_id = v_owner
       and ((v_sku is not null and lower(sku) = lower(v_sku))
            or lower(trim(product_name)) = lower(v_name))
     order by (v_sku is not null and lower(sku) = lower(v_sku)) desc, created_at
     limit 1;

    if found then
      v_before := v_before || jsonb_build_array(jsonb_build_object(
        'id', v_existing.id,
        'sku', v_existing.sku,
        'cost_price', v_existing.cost_price,
        'selling_price', v_existing.selling_price,
        'stock_quantity', v_existing.stock_quantity,
        'low_stock_threshold', v_existing.low_stock_threshold,
        'supplier', v_existing.supplier));
      update inventory set
        sku = coalesce(v_sku, sku),
        cost_price = coalesce((r->>'cost_price')::numeric, cost_price),
        selling_price = coalesce((r->>'selling_price')::numeric, selling_price),
        stock_quantity = coalesce((r->>'stock_quantity')::integer, stock_quantity),
        low_stock_threshold = coalesce((r->>'low_stock_threshold')::integer, low_stock_threshold),
        supplier = coalesce(nullif(left(trim(coalesce(r->>'supplier', '')), 200), ''), supplier)
      where id = v_existing.id;
      v_inv_updated := v_inv_updated + 1;
    else
      insert into inventory (owner_id, product_name, sku, cost_price, selling_price,
                             stock_quantity, low_stock_threshold, supplier, import_id)
      values (v_owner, v_name, v_sku,
              coalesce((r->>'cost_price')::numeric, 0),
              coalesce((r->>'selling_price')::numeric, 0),
              coalesce((r->>'stock_quantity')::integer, 0),
              coalesce((r->>'low_stock_threshold')::integer, 10),
              nullif(left(trim(coalesce(r->>'supplier', '')), 200), ''),
              v_import);
      v_inv_created := v_inv_created + 1;
    end if;
  end loop;

  -- Orders: numbered as one block; skipped when already in Lumina.
  perform pg_advisory_xact_lock(hashtext('orders:' || v_owner::text));
  select coalesce(max((substring(order_number from '(\d+)'))::bigint), 0)
    into v_next from orders where owner_id = v_owner;

  for r in select * from jsonb_array_elements(coalesce(p_orders, '[]'))
  loop
    v_name := nullif(left(trim(coalesce(r->>'product_name', '')), 200), '');
    v_sku := nullif(left(trim(coalesce(r->>'sku', '')), 100), '');
    v_ref := nullif(left(trim(coalesce(r->>'external_ref', '')), 100), '');
    v_date := coalesce((r->>'date')::date, dhaka_today());

    if v_ref is not null then
      if exists (select 1 from orders where owner_id = v_owner and external_ref = v_ref) then
        v_ord_skipped := v_ord_skipped + 1;
        continue;
      end if;
    elsif exists (
      select 1 from orders
       where owner_id = v_owner
         and date = v_date
         and lower(customer_name) = lower(left(trim(coalesce(r->>'customer_name', '')), 200))
         and lower(coalesce(product_name, '')) = lower(coalesce(v_name, ''))
         and quantity = coalesce((r->>'quantity')::integer, 1)
         and selling_price = coalesce((r->>'selling_price')::numeric, 0)
         -- Only records that were there before; identical rows in the same
         -- file are real (two walk-in sales of the same item, say).
         and import_id is distinct from v_import
    ) then
      v_ord_skipped := v_ord_skipped + 1;
      continue;
    end if;

    select id into v_product
      from inventory
     where owner_id = v_owner
       and ((v_sku is not null and lower(sku) = lower(v_sku))
            or (v_name is not null and lower(trim(product_name)) = lower(v_name)))
     order by (v_sku is not null and lower(sku) = lower(v_sku)) desc, created_at
     limit 1;

    v_next := v_next + 1;
    insert into orders (owner_id, order_number, date, customer_name, product_name, product_id,
                        quantity, selling_price, unit_cost, shipping_cost, ad_cost,
                        source, status, external_ref, import_id)
    values (v_owner,
            'ORD-' || lpad(v_next::text, 3, '0'),
            v_date,
            coalesce(nullif(left(trim(coalesce(r->>'customer_name', '')), 200), ''), 'Customer'),
            v_name,
            v_product,
            greatest(coalesce((r->>'quantity')::integer, 1), 1),
            coalesce((r->>'selling_price')::numeric, 0),
            (r->>'unit_cost')::numeric,
            coalesce((r->>'shipping_cost')::numeric, 0),
            coalesce((r->>'ad_cost')::numeric, 0),
            nullif(r->>'source', ''),
            coalesce(nullif(r->>'status', ''), 'Delivered'),
            v_ref,
            v_import);
    v_ord_created := v_ord_created + 1;
  end loop;

  -- Expenses: skipped when the same one is already recorded.
  for r in select * from jsonb_array_elements(coalesce(p_expenses, '[]'))
  loop
    v_date := coalesce((r->>'date')::date, dhaka_today());
    if exists (
      select 1 from expenses
       where owner_id = v_owner
         and date = v_date
         and type = coalesce(r->>'type', 'Miscellaneous')
         and amount = coalesce((r->>'amount')::numeric, 0)
         and lower(coalesce(notes, '')) = lower(coalesce(nullif(left(trim(coalesce(r->>'notes', '')), 500), ''), ''))
         and import_id is distinct from v_import
    ) then
      v_exp_skipped := v_exp_skipped + 1;
      continue;
    end if;
    insert into expenses (owner_id, date, type, amount, platform, notes, import_id)
    values (v_owner, v_date,
            coalesce(r->>'type', 'Miscellaneous'),
            coalesce((r->>'amount')::numeric, 0),
            nullif(left(trim(coalesce(r->>'platform', '')), 100), ''),
            nullif(left(trim(coalesce(r->>'notes', '')), 500), ''),
            v_import);
    v_exp_created := v_exp_created + 1;
  end loop;

  -- One limit check for the whole file: this month's orders, old and new.
  if v_state = 'active' then
    select max_orders_per_month into v_max from plans where id = v_plan;
    if v_max is not null and orders_this_month(v_owner) > v_max then
      raise exception 'plan_limit_orders';
    end if;
  end if;

  v_counts := jsonb_build_object(
    'products_created', v_inv_created,
    'products_updated', v_inv_updated,
    'orders_created', v_ord_created,
    'orders_skipped', v_ord_skipped,
    'expenses_created', v_exp_created,
    'expenses_skipped', v_exp_skipped);

  update imports set counts = v_counts, inventory_before = v_before where id = v_import;

  insert into notifications (type, title, message, owner_id)
  values ('data_import', 'Import complete',
          'Imported ' || v_ord_created || ' orders, ' || (v_inv_created + v_inv_updated)
            || ' products and ' || v_exp_created || ' expenses from '
            || left(coalesce(nullif(trim(p_file_name), ''), 'your file'), 80),
          v_owner);

  return v_counts || jsonb_build_object('import_id', v_import);
end;
$$;

-- Removes everything an import added and puts changed products back.
-- Products the import created stay if real orders now point at them.
create or replace function public.undo_import(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_import imports%rowtype;
  v_orders integer;
  v_expenses integer;
  v_products integer;
  p jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_import from imports where id = p_import_id for update;
  if not found or not has_workspace_access(v_import.owner_id, true) then
    raise exception 'import_not_found';
  end if;
  if v_import.undone_at is not null then
    raise exception 'import_already_undone';
  end if;

  perform set_config('lumina.importing', 'on', true);

  delete from orders where owner_id = v_import.owner_id and import_id = p_import_id;
  get diagnostics v_orders = row_count;
  delete from expenses where owner_id = v_import.owner_id and import_id = p_import_id;
  get diagnostics v_expenses = row_count;

  for p in select * from jsonb_array_elements(v_import.inventory_before)
  loop
    update inventory set
      sku = p->>'sku',
      cost_price = (p->>'cost_price')::numeric,
      selling_price = (p->>'selling_price')::numeric,
      stock_quantity = (p->>'stock_quantity')::integer,
      low_stock_threshold = (p->>'low_stock_threshold')::integer,
      supplier = p->>'supplier'
    where id = (p->>'id')::uuid and owner_id = v_import.owner_id;
  end loop;

  delete from inventory i
   where i.owner_id = v_import.owner_id
     and i.import_id = p_import_id
     and not exists (select 1 from orders o where o.product_id = i.id);
  get diagnostics v_products = row_count;

  update imports set undone_at = now() where id = p_import_id;

  return jsonb_build_object('orders_removed', v_orders, 'expenses_removed', v_expenses,
                            'products_removed', v_products,
                            'products_restored', jsonb_array_length(v_import.inventory_before));
end;
$$;

revoke execute on function public.import_business_data(text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.import_business_data(text, jsonb, jsonb, jsonb) to authenticated;
revoke execute on function public.undo_import(uuid) from public, anon;
grant execute on function public.undo_import(uuid) to authenticated;
revoke execute on function public.is_importing() from public, anon;
