-- Security hardening and data-integrity fixes.
-- Also records hand-made production changes (avatars bucket, notify_* triggers)
-- so the migrations folder matches the live database.

------------------------------------------------------------------------------
-- 1. Avatars storage bucket (created by hand on production)
------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 512000, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set allowed_mime_types = excluded.allowed_mime_types,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "Anyone can view avatars" on storage.objects;
drop policy if exists "Users can upload own avatar" on storage.objects;
drop policy if exists "Users can update own avatar" on storage.objects;
drop policy if exists "Users can delete own avatar" on storage.objects;

create policy "Anyone can view avatars" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "Users can upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users can update own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users can delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

------------------------------------------------------------------------------
-- 2. Row level security: authenticated users only, no duplicate policies
------------------------------------------------------------------------------
drop policy if exists workspace_select_marketing on public.marketing_outputs;
drop policy if exists workspace_insert_marketing on public.marketing_outputs;
drop policy if exists workspace_update_marketing on public.marketing_outputs;
drop policy if exists workspace_delete_marketing on public.marketing_outputs;

do $$
declare
  t text;
begin
  foreach t in array array['inventory','orders','expenses','notes','marketing_outputs','notifications']
  loop
    execute format('drop policy if exists workspace_select_%1$s on public.%1$s', t);
    execute format('drop policy if exists workspace_insert_%1$s on public.%1$s', t);
    execute format('drop policy if exists workspace_update_%1$s on public.%1$s', t);
    execute format('drop policy if exists workspace_delete_%1$s on public.%1$s', t);

    execute format('create policy workspace_select_%1$s on public.%1$s for select to authenticated using (public.has_workspace_access(owner_id, false))', t);
    execute format('create policy workspace_insert_%1$s on public.%1$s for insert to authenticated with check (public.has_workspace_access(owner_id, true))', t);
    execute format('create policy workspace_update_%1$s on public.%1$s for update to authenticated using (public.has_workspace_access(owner_id, true)) with check (public.has_workspace_access(owner_id, true))', t);
    execute format('create policy workspace_delete_%1$s on public.%1$s for delete to authenticated using (public.has_workspace_access(owner_id, true))', t);
  end loop;
end $$;

drop policy if exists team_members_select on public.team_members;
drop policy if exists team_members_owner_insert on public.team_members;
drop policy if exists team_members_owner_update on public.team_members;
drop policy if exists team_members_owner_or_self_delete on public.team_members;

create policy team_members_select on public.team_members
  for select to authenticated using (owner_id = auth.uid() or member_id = auth.uid());
create policy team_members_owner_insert on public.team_members
  for insert to authenticated with check (owner_id = auth.uid());
create policy team_members_owner_update on public.team_members
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy team_members_owner_or_self_delete on public.team_members
  for delete to authenticated using (owner_id = auth.uid() or member_id = auth.uid());

drop policy if exists own_settings_select on public.user_settings;
drop policy if exists own_settings_insert on public.user_settings;
drop policy if exists own_settings_update on public.user_settings;
drop policy if exists own_settings_delete on public.user_settings;

create policy own_settings_select on public.user_settings
  for select to authenticated using (user_id = auth.uid() or public.has_workspace_access(owner_id, false));
create policy own_settings_insert on public.user_settings
  for insert to authenticated with check (user_id = auth.uid());
create policy own_settings_update on public.user_settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_settings_delete on public.user_settings
  for delete to authenticated using (user_id = auth.uid());

-- Invites: only the owner can see them. The old public_read_invite policy let
-- anyone (even logged out) read every token and join any workspace.
drop policy if exists public_read_invite on public.invites;
drop policy if exists owner_manages_invites on public.invites;
create policy owner_manages_invites on public.invites
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

------------------------------------------------------------------------------
-- 3. Invites: preview by token, safer acceptance
------------------------------------------------------------------------------
create or replace function public.get_invite_preview(p_token text)
returns table (role text, email text, business_name text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select i.role,
         i.email,
         coalesce(s.business_name, 'a business'),
         case
           when i.used then 'used'
           when i.expires_at < now() then 'expired'
           else 'valid'
         end
  from invites i
  left join user_settings s on s.user_id = i.owner_id
  where i.token = p_token;
$$;

create or replace function public.accept_team_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_uid uuid := auth.uid();
  v_email text;
  v_full_name text;
  v_existing record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_invite
  from invites
  where token = p_token and used = false
  for update;

  if not found then
    raise exception 'invite_not_found_or_used';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'invite_expired';
  end if;

  select email, raw_user_meta_data->>'full_name' into v_email, v_full_name
  from auth.users where id = v_uid;

  if lower(v_email) <> lower(v_invite.email) then
    raise exception 'invite_email_mismatch';
  end if;

  if v_invite.owner_id = v_uid then
    raise exception 'cannot_join_own_workspace';
  end if;

  select role, onboarding_complete into v_existing
  from user_settings where user_id = v_uid;

  if found and v_existing.role = 'owner' and v_existing.onboarding_complete then
    raise exception 'already_owns_workspace';
  end if;

  insert into team_members (owner_id, member_id, email, role, status)
  values (v_invite.owner_id, v_uid, v_email, v_invite.role, 'active')
  on conflict (owner_id, member_id) do update
    set status = 'active', role = excluded.role;

  insert into user_settings (user_id, owner_id, role, onboarding_complete, full_name)
  values (v_uid, v_invite.owner_id, v_invite.role, true, coalesce(v_full_name, ''))
  on conflict (user_id) do update
    set owner_id = excluded.owner_id,
        role = excluded.role,
        onboarding_complete = true;

  update invites set used = true where id = v_invite.id;
end;
$$;

------------------------------------------------------------------------------
-- 4. user_settings: users cannot change their own role / workspace
------------------------------------------------------------------------------
create or replace function public.guard_user_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only direct API calls are restricted; SECURITY DEFINER functions
  -- (accept_team_invite, team sync triggers) run as the table owner.
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.role := 'owner';
      new.owner_id := new.user_id;
    else
      new.user_id := old.user_id;
      new.role := old.role;
      new.owner_id := old.owner_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_user_settings on public.user_settings;
create trigger trg_guard_user_settings
  before insert or update on public.user_settings
  for each row execute function public.guard_user_settings();

-- Keep a member's settings in sync with their team_members row.
create or replace function public.sync_member_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- Removed from the team: they become owner of a fresh workspace and
    -- go through onboarding again.
    update user_settings
       set role = 'owner', owner_id = user_id, onboarding_complete = false
     where user_id = old.member_id and owner_id = old.owner_id;
    return old;
  end if;

  if new.role is distinct from old.role then
    update user_settings
       set role = new.role
     where user_id = new.member_id and owner_id = new.owner_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_member_settings on public.team_members;
create trigger trg_sync_member_settings
  after update or delete on public.team_members
  for each row execute function public.sync_member_settings();

------------------------------------------------------------------------------
-- 5. Orders: per-workspace numbering, cost snapshot, profit, stock
------------------------------------------------------------------------------
alter table public.orders add column if not exists unit_cost numeric not null default 0;
alter table public.orders add column if not exists product_name text;
-- product_id is ON DELETE SET NULL, so it must be nullable; otherwise products
-- with orders can never be deleted. product_name keeps the history readable.
alter table public.orders alter column product_id drop not null;

alter table public.orders drop constraint if exists orders_order_number_key;
alter table public.orders drop constraint if exists orders_owner_order_number_key;
alter table public.orders add constraint orders_owner_order_number_key unique (owner_id, order_number);

drop trigger if exists trg_calculate_profit on public.orders;
drop trigger if exists trg_decrement_stock on public.orders;
drop trigger if exists trg_restore_stock_on_cancel on public.orders;
drop function if exists public.fn_calculate_profit();
drop function if exists public.fn_decrement_stock();
drop function if exists public.fn_restore_stock_on_cancel();

create or replace function public.orders_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost numeric;
  v_name text;
begin
  if tg_op = 'INSERT' then
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
    new.unit_cost := coalesce(v_cost, 0);
    new.product_name := v_name;
  end if;

  new.profit_per_order := new.selling_price * new.quantity
                        - coalesce(new.unit_cost, 0) * new.quantity
                        - new.shipping_cost
                        - new.ad_cost;
  return new;
end;
$$;

drop trigger if exists trg_orders_before_write on public.orders;
create trigger trg_orders_before_write
  before insert or update on public.orders
  for each row execute function public.orders_before_write();

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
  -- Cancelled orders hold no stock.
  if tg_op in ('UPDATE', 'DELETE') and old.status <> 'Cancelled' then
    v_old_qty := old.quantity;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.status <> 'Cancelled' then
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

drop trigger if exists trg_orders_sync_stock on public.orders;
create trigger trg_orders_sync_stock
  after insert or update or delete on public.orders
  for each row execute function public.orders_sync_stock();

------------------------------------------------------------------------------
-- 6. Notification triggers
------------------------------------------------------------------------------
drop function if exists public.fn_notify_new_order();
drop function if exists public.fn_notify_low_stock();
drop function if exists public.get_my_owner_id();

create or replace function public.currency_symbol(p_owner uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case (select currency from user_settings where user_id = p_owner)
           when 'INR' then '₹'
           when 'USD' then '$'
           else '৳'
         end;
$$;

-- True unless the workspace owner switched this notification type off.
create or replace function public.notification_enabled(p_owner uuid, p_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (notification_preferences->>p_type)::boolean
       from user_settings where user_id = p_owner),
    true);
$$;

create or replace function public.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if notification_enabled(new.owner_id, 'new_order') then
    insert into notifications (type, title, message, owner_id)
    values ('new_order', 'New Order Received',
            'Order ' || new.order_number || ' from ' || new.customer_name || ' for '
              || currency_symbol(new.owner_id) || round(new.selling_price * new.quantity),
            new.owner_id);
  end if;
  return new;
end;
$$;

create or replace function public.notify_cancelled_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'Cancelled' and old.status <> 'Cancelled'
     and notification_enabled(new.owner_id, 'cancelled_order') then
    insert into notifications (type, title, message, owner_id)
    values ('cancelled_order', 'Order Cancelled',
            'Order ' || new.order_number || ' from ' || new.customer_name || ' was cancelled',
            new.owner_id);
  end if;
  return new;
end;
$$;

-- profit_per_order is filled in by the BEFORE trigger, so NEW is final here.
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
  if v_revenue > 0 and notification_enabled(new.owner_id, 'profit_drop') then
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
  if new.ad_cost > 0 and notification_enabled(new.owner_id, 'roas_alert') then
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
  elsif new.stock_quantity <= new.low_stock_threshold
        and old.stock_quantity > old.low_stock_threshold then
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

drop trigger if exists trg_notify_new_order on public.orders;
drop trigger if exists trg_notify_cancelled_order on public.orders;
drop trigger if exists trg_notify_profit_drop on public.orders;
drop trigger if exists trg_notify_roas_alert on public.orders;
drop trigger if exists trg_notify_low_stock on public.inventory;

create trigger trg_notify_new_order after insert on public.orders
  for each row execute function public.notify_new_order();
create trigger trg_notify_cancelled_order after update on public.orders
  for each row execute function public.notify_cancelled_order();
create trigger trg_notify_profit_drop after insert on public.orders
  for each row execute function public.notify_profit_drop();
create trigger trg_notify_roas_alert after insert on public.orders
  for each row execute function public.notify_roas_alert();
create trigger trg_notify_low_stock after update of stock_quantity, low_stock_threshold on public.inventory
  for each row execute function public.notify_low_stock();

-- Realtime: the app subscribes to notification inserts, but the table was
-- never added to the publication, so live toasts never arrived.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

------------------------------------------------------------------------------
-- 7. Indexes for workspace-scoped queries and RLS checks
------------------------------------------------------------------------------
create index if not exists idx_orders_owner_date on public.orders (owner_id, date);
create index if not exists idx_orders_product on public.orders (product_id);
create index if not exists idx_inventory_owner on public.inventory (owner_id);
create index if not exists idx_expenses_owner_date on public.expenses (owner_id, date);
create index if not exists idx_notes_owner on public.notes (owner_id);
create index if not exists idx_marketing_outputs_owner on public.marketing_outputs (owner_id);
create index if not exists idx_notifications_owner_created on public.notifications (owner_id, created_at desc);
create index if not exists idx_user_settings_owner on public.user_settings (owner_id);
create index if not exists idx_team_members_member on public.team_members (member_id);
create index if not exists idx_invites_owner on public.invites (owner_id);

------------------------------------------------------------------------------
-- 8. Function privileges: nothing callable by anonymous users except the
--    invite preview; trigger functions not callable over the API at all.
------------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

grant execute on function public.has_workspace_access(uuid, boolean) to authenticated;
grant execute on function public.accept_team_invite(text) to authenticated;
grant execute on function public.get_invite_preview(text) to anon, authenticated;
