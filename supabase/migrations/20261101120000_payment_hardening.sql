-- Payment hardening.
--
-- 1. A Starter payment made while Pro is running (e.g. an old Starter checkout
--    paid after upgrading) used to extend Pro by a full period at the Starter
--    price. It now buys Pro time worth what was paid.
-- 2. Payments SSLCommerz flags as risky are kept as 'review' instead of
--    staying 'pending' forever, so the customer and the owner can see them.
-- 3. Billing tables are only written by the server; browsers lose write
--    grants entirely (RLS already blocked them; this is a second lock).

alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status = any (array['pending', 'paid', 'failed', 'cancelled', 'review']));

create or replace function public.activate_payment(p_tran_id text, p_val_id text, p_amount numeric, p_card_type text, p_response jsonb)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pay payments%rowtype;
  v_sub subscriptions%rowtype;
  v_has_sub boolean;
  v_paid_running boolean;
  v_start timestamptz;
  v_plan text;
  v_length interval;
  v_pro_price numeric;
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

  v_plan := v_pay.plan;
  v_length := case v_pay.billing_period when 'yearly' then interval '1 year' else interval '1 month' end;

  -- Pro stays on, but only for as long as the Starter money buys at Pro rates.
  if v_paid_running and v_sub.plan = 'pro' and v_pay.plan = 'starter' then
    select case v_pay.billing_period when 'yearly' then yearly_price else monthly_price end
      into v_pro_price from plans where id = 'pro';
    v_plan := 'pro';
    v_length := case v_pay.billing_period when 'yearly' then interval '365 days' else interval '30 days' end
                * (v_pay.amount / v_pro_price)::double precision;
  end if;

  insert into subscriptions (owner_id, plan, status, billing_period, current_period_end, updated_at)
  values (v_pay.owner_id, v_plan, 'active', v_pay.billing_period, v_start + v_length, now())
  on conflict (owner_id) do update
    set plan = excluded.plan,
        status = 'active',
        billing_period = excluded.billing_period,
        current_period_end = excluded.current_period_end,
        updated_at = now();

  return 'activated';
end;
$function$;

revoke all on function public.activate_payment(text, text, numeric, text, jsonb) from public, anon, authenticated;
grant execute on function public.activate_payment(text, text, numeric, text, jsonb) to service_role;

revoke insert, update, delete, truncate, references, trigger on public.payments, public.subscriptions, public.plans from anon, authenticated;
