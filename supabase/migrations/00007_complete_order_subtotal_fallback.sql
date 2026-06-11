-- ============================================================
-- Dos Tazas POS - complete_order subtotal fallback
-- Run AFTER 00006_inventory.sql
--
-- Defensive fix: if an order reaches completion without a money
-- breakdown (subtotal = 0 but total_amount > 0 — e.g. parked by an
-- older client before server-authoritative pricing shipped), fall
-- back to total_amount instead of finalizing the sale at $0.
-- ============================================================

-- One-time backfill for any such orders still parked.
update public.orders
  set subtotal = total_amount
  where status = 'parked' and subtotal = 0 and total_amount > 0;


create or replace function public.complete_order(
  p_order_id uuid,
  p_payment_method text,
  p_payment_reference text default null,
  p_tip_amount numeric default 0,
  p_amount_tendered numeric default null,
  p_customer_name text default null,
  p_customer_id text default null,
  p_customer_email text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_order public.orders;
  v_tip numeric(10,2);
  v_subtotal numeric(10,2);
  v_total numeric(10,2);
  v_change numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_location_id := public.get_current_location_id();

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
  -- Fall back to total_amount for legacy orders with no breakdown.
  v_subtotal := coalesce(nullif(v_order.subtotal, 0), v_order.total_amount, 0);
  v_total := v_subtotal + v_order.tax_amount - v_order.discount_amount + v_tip;

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
        payment_method = p_payment_method,
        payment_reference = p_payment_reference,
        tip_amount = v_tip,
        subtotal = v_subtotal,
        total_amount = v_total,
        amount_tendered = case when p_payment_method = 'cash' then p_amount_tendered else null end,
        change_due = v_change,
        customer_name = p_customer_name,
        customer_id = p_customer_id,
        customer_email = p_customer_email
    where id = p_order_id;

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
