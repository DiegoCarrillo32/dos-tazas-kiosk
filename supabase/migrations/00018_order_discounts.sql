-- ============================================================
-- Dos Tazas POS - Order discounts with a required reason
-- Run AFTER 00017_harden_get_current_location_id.sql
--
-- `orders.discount_amount` has existed since 00005, but nothing ever
-- wrote to it: there was no way to comp a drink, apply a staff rate, or
-- take money off a botched order. This adds that at the one moment it
-- belongs -- the Counter, immediately before payment -- and makes the
-- money land correctly.
--
-- Three things worth calling out:
--
-- 1. IVA. Prices are tax-inclusive, so a discount reduces what the
--    customer pays *including* the IVA inside it. Hacienda is owed IVA on
--    the discounted price, not the list price, so complete_order now
--    re-splits the discounted gross into net + IVA proportionally and
--    stores both. Reporting sums `subtotal` as net sales and `tax_amount`
--    as IVA collected (00014, 00015), so leaving those at their
--    list-price values would over-declare revenue and over-declare tax.
--
-- 2. The stored invariant becomes:
--        total_amount = subtotal + tax_amount + tip_amount
--    with `discount_amount` a record of what was given away rather than a
--    term still to be subtracted. Every existing row has
--    discount_amount = 0, so this is arithmetically identical to the old
--    `subtotal + tax - discount + tip` for all historical data.
--
-- 3. A reason is mandatory whenever a discount is applied, and every one
--    is written to order_audit. Discounts are the classic route for
--    shrinkage in a cafe; an unattributed discount is indistinguishable
--    from someone pocketing the difference.
--
-- Order lines keep their list prices -- an order-level discount is not
-- apportioned across them -- so per-item revenue in the category and
-- top-item reports stays gross of discounts. The order-level figures
-- (net_sales, tax_amount, gross_sales, discount_amount) are the ones
-- that reconcile.
-- ============================================================


-- ============================================================
-- 1. The reason column
-- ============================================================

alter table public.orders
  add column if not exists discount_reason text;


-- ============================================================
-- 2. Let the audit trail record discounts
--
-- 00013 created order_audit with an inline check allowing only
-- 'void' and 'refund'.
-- ============================================================

alter table public.order_audit drop constraint if exists order_audit_action_check;
alter table public.order_audit add constraint order_audit_action_check
  check (action in ('void', 'refund', 'discount'));


-- ============================================================
-- 3. complete_order v3 -- optional discount, applied at checkout
--
-- The discount is passed in at payment rather than stored on the parked
-- order beforehand, so the whole thing is one atomic call: the amount is
-- computed, the reason checked, the IVA re-split and the payment taken
-- together, or none of it happens.
--
-- The client sends a *type and a value* ('percent' + 10, or 'amount' +
-- 500), never a finished figure -- the same rule the rest of the pricing
-- engine follows. A client that sent its own discount_amount could take
-- an arbitrary sum off the till.
--
-- The 8-argument signature is dropped rather than replaced: adding
-- defaulted parameters creates a second overload, and PostgREST cannot
-- resolve a call that matches both.
-- ============================================================

drop function if exists public.complete_order(uuid, text, text, numeric, numeric, text, text, text);

create or replace function public.complete_order(
  p_order_id uuid,
  p_payment_method text,
  p_payment_reference text default null,
  p_tip_amount numeric default 0,
  p_amount_tendered numeric default null,
  p_customer_name text default null,
  p_customer_id text default null,
  p_customer_email text default null,
  p_discount_type text default null,      -- 'percent' | 'amount' | null
  p_discount_value numeric default 0,
  p_discount_reason text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_order public.orders;
  v_shift_id uuid;
  v_tip numeric(10,2);
  v_subtotal numeric(10,2);
  v_tax numeric(10,2);
  v_gross numeric(10,2);
  v_discount numeric(10,2) := 0;
  v_reason text;
  v_net_gross numeric(10,2);
  v_total numeric(10,2);
  v_change numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_location_id := public.get_current_location_id();

  v_shift_id := public.current_shift_id();
  if v_shift_id is null then
    raise exception 'No shift is open. Open a shift before taking payment.';
  end if;

  select * into v_order
    from public.orders
    where id = p_order_id and location_id = v_location_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.status <> 'parked' then
    raise exception 'Order is not parked (status: %)', v_order.status;
  end if;

  if p_payment_method not in ('card', 'cash', 'sinpe') then
    raise exception 'Invalid payment method';
  end if;
  if p_payment_method = 'sinpe' and coalesce(p_payment_reference, '') = '' then
    raise exception 'SINPE reference required';
  end if;

  v_tip := greatest(0, coalesce(p_tip_amount, 0));
  v_subtotal := coalesce(nullif(v_order.subtotal, 0), v_order.total_amount, 0);
  v_tax := v_order.tax_amount;

  -- What the order is worth at list price, tax included, before any tip.
  -- This is also the sum of order_items.total_price, which is what the
  -- receipt prints line by line.
  v_gross := v_subtotal + v_tax;

  -- ── Discount ────────────────────────────────────────────
  v_reason := nullif(trim(coalesce(p_discount_reason, '')), '');

  if p_discount_type is not null and coalesce(p_discount_value, 0) > 0 then
    if p_discount_type = 'percent' then
      if p_discount_value > 100 then
        raise exception 'A discount cannot exceed 100%%';
      end if;
      v_discount := round(v_gross * p_discount_value / 100, 2);
    elsif p_discount_type = 'amount' then
      v_discount := round(p_discount_value, 2);
      if v_discount > v_gross then
        raise exception 'Discount is larger than the order total';
      end if;
    else
      raise exception 'Invalid discount type: %', p_discount_type;
    end if;
  end if;

  if v_discount > 0 and v_reason is null then
    raise exception 'A reason is required to apply a discount';
  end if;
  -- A reason with no discount is just a stray note; drop it so the audit
  -- and the receipt do not claim a discount that was never given.
  if v_discount = 0 then
    v_reason := null;
  end if;

  if v_discount > 0 then
    -- Re-split the discounted gross into net + IVA in the same proportion
    -- as the original. IVA is owed on what the customer actually paid.
    v_net_gross := v_gross - v_discount;
    v_tax := round(v_tax * v_net_gross / v_gross, 2);
    v_subtotal := v_net_gross - v_tax;
  end if;

  -- subtotal and tax are already net of the discount, so it is not
  -- subtracted again here.
  v_total := v_subtotal + v_tax + v_tip;

  if p_payment_method = 'cash' then
    if p_amount_tendered is null then
      raise exception 'Amount tendered required for cash';
    end if;
    if p_amount_tendered < v_total then
      raise exception 'Amount tendered is less than the total due';
    end if;
    v_change := p_amount_tendered - v_total;
  end if;

  update public.orders
    set status = 'completed',
        shift_id = v_shift_id,
        payment_method = p_payment_method,
        payment_reference = p_payment_reference,
        tip_amount = v_tip,
        subtotal = v_subtotal,
        tax_amount = v_tax,
        discount_amount = v_discount,
        discount_reason = v_reason,
        total_amount = v_total,
        amount_tendered = case when p_payment_method = 'cash' then p_amount_tendered else null end,
        change_due = v_change,
        customer_name = p_customer_name,
        customer_id = p_customer_id,
        customer_email = p_customer_email
    where id = p_order_id;

  if v_discount > 0 then
    insert into public.order_audit (order_id, location_id, action, actor_id, reason, order_snapshot)
      values (
        p_order_id, v_location_id, 'discount', auth.uid(), v_reason,
        jsonb_build_object(
          'discount_type', p_discount_type,
          'discount_value', p_discount_value,
          'discount_amount', v_discount,
          'gross_before_discount', v_gross,
          'total_charged', v_total
        )
      );
  end if;

  update public.menu_items mi
    set available_quantity = greatest(0, mi.available_quantity - oi.qty)
    from (
      select menu_item_id, sum(quantity) as qty
      from public.order_items
      where order_id = p_order_id
      group by menu_item_id
    ) oi
    where mi.id = oi.menu_item_id
      and mi.track_inventory = true;
end;
$$;

revoke execute on function public.complete_order(
  uuid, text, text, numeric, numeric, text, text, text, text, numeric, text
) from public, anon;
grant execute on function public.complete_order(
  uuid, text, text, numeric, numeric, text, text, text, text, numeric, text
) to authenticated;


-- ============================================================
-- 4. Carry the reason into the accounting export
--
-- The CSV already had a Discount column; a column of amounts with no
-- explanation is exactly the thing an accountant has to come back and ask
-- about. Dropped and recreated because the return type changes.
-- ============================================================

drop function if exists public.orders_for_export(date, date);

create or replace function public.orders_for_export(
  p_start date,
  p_end date
)
returns table (
  order_number integer,
  order_id uuid,
  local_time timestamp,
  status text,
  table_name text,
  staff_name text,
  item_count bigint,
  subtotal numeric,
  tax_amount numeric,
  discount_amount numeric,
  discount_reason text,
  tip_amount numeric,
  total_amount numeric,
  payment_method text,
  payment_reference text,
  amount_tendered numeric,
  change_due numeric,
  customer_name text,
  customer_id text,
  customer_email text
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_tz text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_location_id := public.get_current_location_id();

  select coalesce(ls.timezone, 'America/Costa_Rica') into v_tz
    from public.location_settings ls where ls.location_id = v_location_id;
  v_tz := coalesce(v_tz, 'America/Costa_Rica');

  return query
  select
    o.order_number,
    o.id,
    (o.created_at at time zone v_tz),
    o.status,
    t.name,
    nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), ''),
    coalesce((select sum(oi.quantity) from public.order_items oi where oi.order_id = o.id), 0),
    o.subtotal,
    o.tax_amount,
    o.discount_amount,
    o.discount_reason,
    o.tip_amount,
    o.total_amount,
    o.payment_method,
    o.payment_reference,
    o.amount_tendered,
    o.change_due,
    o.customer_name,
    o.customer_id,
    o.customer_email
  from public.orders o
  left join public.tables t on t.id = o.table_id
  left join public.user_profiles up on up.id = o.user_id
  where o.location_id = v_location_id
    and o.status in ('completed', 'refunded')
    and o.created_at >= (p_start::timestamp) at time zone v_tz
    and o.created_at <  ((p_end + 1)::timestamp) at time zone v_tz
  order by o.created_at;
end;
$$;

revoke execute on function public.orders_for_export(date, date) from public, anon;
grant execute on function public.orders_for_export(date, date) to authenticated;
