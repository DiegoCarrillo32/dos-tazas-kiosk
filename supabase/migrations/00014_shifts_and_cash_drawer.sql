-- ============================================================
-- Dos Tazas POS - Shifts & cash drawer reconciliation
-- Run AFTER 00013_order_write_lockdown.sql
--
-- Adds the missing operational layer: a shift (a till session) with an
-- opening float, every completed order stamped with the shift that took
-- the money, mid-shift paid-in / paid-out movements, and a close that
-- compares counted cash against expected cash and records the variance.
--
--   X-report = shift_summary()  → peek at the drawer without closing
--   Z-report = close_shift()    → final count, variance, shift closed
--
-- All amounts are Costa Rican colones (CRC).
-- ============================================================


-- ============================================================
-- SHIFTS
-- ============================================================

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations(id) on delete cascade not null,
  opened_by uuid references public.user_profiles(id) on delete set null,
  closed_by uuid references public.user_profiles(id) on delete set null,
  opened_at timestamptz default now() not null,
  closed_at timestamptz,
  opening_float numeric(10,2) default 0 not null,
  expected_cash numeric(10,2),      -- snapshot taken at close
  counted_cash numeric(10,2),       -- summed from the denomination counter
  counted_breakdown jsonb,          -- { "10000": 3, "5000": 2, ... } CRC denominations
  cash_variance numeric(10,2),      -- counted - expected (negative = short)
  status text check (status in ('open', 'closed')) default 'open' not null,
  closing_note text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- At most one open shift per location. This is what makes "the current
-- shift" unambiguous everywhere else.
create unique index shifts_one_open_per_location
  on public.shifts (location_id) where status = 'open';

create index shifts_location_opened_idx
  on public.shifts (location_id, opened_at desc);

alter table public.shifts enable row level security;

-- Readable by staff at the location; all writes go through the RPCs below.
create policy "shifts_select" on public.shifts
  for select to authenticated
  using (location_id = public.get_current_location_id());

create trigger handle_updated_at before update on public.shifts
  for each row execute procedure moddatetime (updated_at);


-- ============================================================
-- CASH MOVEMENTS  (paid-in / paid-out)
--
-- Cash that enters or leaves the drawer for a reason other than a sale:
-- paying a supplier from the till, topping up change, petty cash. Without
-- these, expected cash can never match counted cash on any day the shop
-- pays for something out of the drawer.
-- ============================================================

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references public.shifts(id) on delete cascade not null,
  location_id uuid references public.locations(id) on delete cascade not null,
  type text check (type in ('paid_in', 'paid_out')) not null,
  amount numeric(10,2) not null check (amount > 0),
  reason text not null,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz default now() not null
);

create index cash_movements_shift_idx on public.cash_movements (shift_id, created_at);

alter table public.cash_movements enable row level security;

create policy "cash_movements_select" on public.cash_movements
  for select to authenticated
  using (location_id = public.get_current_location_id());


-- ============================================================
-- LINK ORDERS TO SHIFTS
--
-- Stamped by complete_order at PAYMENT time, not at order creation:
-- reconciliation cares about when the money entered the drawer, not when
-- the cup was ordered. An order parked before close and paid after the
-- next shift opens belongs to the shift that took the cash.
-- ============================================================

alter table public.orders
  add column shift_id uuid references public.shifts(id) on delete set null;

create index orders_shift_idx on public.orders (shift_id);


-- ============================================================
-- current_shift_id — the one open shift for the caller's location
-- ============================================================

create or replace function public.current_shift_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.shifts
    where location_id = public.get_current_location_id()
      and status = 'open'
    limit 1;
$$;

revoke execute on function public.current_shift_id() from public, anon;
grant execute on function public.current_shift_id() to authenticated;


-- ============================================================
-- open_shift
-- ============================================================

create or replace function public.open_shift(p_opening_float numeric default 0)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_shift_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_location_id := public.get_current_location_id();
  if v_location_id is null then
    raise exception 'No location for user';
  end if;

  if p_opening_float < 0 then
    raise exception 'Opening float cannot be negative';
  end if;

  if exists (
    select 1 from public.shifts
      where location_id = v_location_id and status = 'open'
  ) then
    raise exception 'A shift is already open. Close it before opening a new one.';
  end if;

  insert into public.shifts (location_id, opened_by, opening_float)
    values (v_location_id, auth.uid(), round(p_opening_float))
    returning id into v_shift_id;

  return v_shift_id;
end;
$$;

revoke execute on function public.open_shift(numeric) from public, anon;
grant execute on function public.open_shift(numeric) to authenticated;


-- ============================================================
-- record_cash_movement
-- ============================================================

create or replace function public.record_cash_movement(
  p_type text,
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_shift_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_type not in ('paid_in', 'paid_out') then
    raise exception 'Invalid movement type';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required';
  end if;

  v_location_id := public.get_current_location_id();
  v_shift_id := public.current_shift_id();
  if v_shift_id is null then
    raise exception 'No shift is open. Open a shift before recording cash movements.';
  end if;

  insert into public.cash_movements (shift_id, location_id, type, amount, reason, created_by)
    values (v_shift_id, v_location_id, p_type, round(p_amount), trim(p_reason), auth.uid())
    returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.record_cash_movement(text, numeric, text) from public, anon;
grant execute on function public.record_cash_movement(text, numeric, text) to authenticated;


-- ============================================================
-- shift_summary — the X-report
--
-- Expected cash in the drawer:
--
--   opening_float
--   + cash sales          (for a cash order, tendered - change = total,
--                          so the net into the drawer is just the total)
--   - cash refunds
--   + paid in
--   - paid out
--
-- Also returns the full sales picture so the same payload can render
-- both the mid-shift peek and the end-of-day Z-report.
-- ============================================================

create or replace function public.shift_summary(p_shift_id uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_shift public.shifts;
  v_sales jsonb;
  v_movements jsonb;
  v_expected numeric(10,2);
  v_cash_sales numeric(10,2);
  v_cash_refunds numeric(10,2);
  v_paid_in numeric(10,2);
  v_paid_out numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_location_id := public.get_current_location_id();

  select * into v_shift from public.shifts
    where id = coalesce(p_shift_id, public.current_shift_id())
      and location_id = v_location_id;
  if not found then
    return null;
  end if;

  -- Sales rung up during this shift, split by payment method and status.
  select
    coalesce(sum(o.total_amount) filter (where o.status = 'completed' and o.payment_method = 'cash'), 0),
    coalesce(sum(o.total_amount) filter (where o.status = 'refunded'  and o.payment_method = 'cash'), 0)
  into v_cash_sales, v_cash_refunds
  from public.orders o
  where o.shift_id = v_shift.id;

  select
    coalesce(sum(amount) filter (where type = 'paid_in'), 0),
    coalesce(sum(amount) filter (where type = 'paid_out'), 0)
  into v_paid_in, v_paid_out
  from public.cash_movements where shift_id = v_shift.id;

  v_expected := v_shift.opening_float + v_cash_sales - v_cash_refunds + v_paid_in - v_paid_out;

  select jsonb_build_object(
    'order_count',   count(*) filter (where status = 'completed'),
    'refund_count',  count(*) filter (where status = 'refunded'),
    'void_count',    count(*) filter (where status = 'cancelled'),
    'gross_sales',   coalesce(sum(total_amount) filter (where status = 'completed'), 0),
    'net_sales',     coalesce(sum(subtotal)     filter (where status = 'completed'), 0),
    'tax_amount',    coalesce(sum(tax_amount)   filter (where status = 'completed'), 0),
    'tip_amount',    coalesce(sum(tip_amount)   filter (where status = 'completed'), 0),
    'discount_amount', coalesce(sum(discount_amount) filter (where status = 'completed'), 0),
    'refund_total',  coalesce(sum(total_amount) filter (where status = 'refunded'), 0),
    'by_payment_method', coalesce((
      select jsonb_object_agg(pm, amt) from (
        select payment_method as pm, sum(total_amount) as amt
        from public.orders
        where shift_id = v_shift.id and status = 'completed' and payment_method is not null
        group by payment_method
      ) s
    ), '{}'::jsonb)
  )
  into v_sales
  from public.orders where shift_id = v_shift.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', cm.id,
    'type', cm.type,
    'amount', cm.amount,
    'reason', cm.reason,
    'created_at', cm.created_at,
    'created_by_name', trim(coalesce(up.first_name, '') || ' ' || coalesce(up.last_name, ''))
  ) order by cm.created_at), '[]'::jsonb)
  into v_movements
  from public.cash_movements cm
  left join public.user_profiles up on up.id = cm.created_by
  where cm.shift_id = v_shift.id;

  return jsonb_build_object(
    'shift_id',       v_shift.id,
    'status',         v_shift.status,
    'opened_at',      v_shift.opened_at,
    'closed_at',      v_shift.closed_at,
    'opened_by_name', (select trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
                         from public.user_profiles where id = v_shift.opened_by),
    'closed_by_name', (select trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
                         from public.user_profiles where id = v_shift.closed_by),
    'opening_float',  v_shift.opening_float,
    'cash_sales',     v_cash_sales,
    'cash_refunds',   v_cash_refunds,
    'paid_in',        v_paid_in,
    'paid_out',       v_paid_out,
    -- For a closed shift, report the expected figure snapshotted at close
    -- rather than recomputing it, so a reprinted Z-report never drifts.
    'expected_cash',  coalesce(v_shift.expected_cash, v_expected),
    'counted_cash',   v_shift.counted_cash,
    'counted_breakdown', v_shift.counted_breakdown,
    'cash_variance',  v_shift.cash_variance,
    'closing_note',   v_shift.closing_note,
    'movements',      v_movements,
    'sales',          v_sales
  );
end;
$$;

revoke execute on function public.shift_summary(uuid) from public, anon;
grant execute on function public.shift_summary(uuid) to authenticated;


-- ============================================================
-- close_shift — the Z-report
-- ============================================================

create or replace function public.close_shift(
  p_counted_cash numeric,
  p_counted_breakdown jsonb default null,
  p_note text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_shift_id uuid;
  v_expected numeric(10,2);
  v_counted numeric(10,2);
  v_summary jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'Counted cash is required and cannot be negative';
  end if;

  v_location_id := public.get_current_location_id();
  v_shift_id := public.current_shift_id();
  if v_shift_id is null then
    raise exception 'No shift is open';
  end if;

  -- Reuse the X-report to derive expected cash, so the two can never
  -- disagree about how the drawer is calculated.
  v_summary := public.shift_summary(v_shift_id);
  v_expected := (v_summary->>'expected_cash')::numeric;
  v_counted := round(p_counted_cash);

  update public.shifts
    set status = 'closed',
        closed_at = now(),
        closed_by = auth.uid(),
        expected_cash = v_expected,
        counted_cash = v_counted,
        counted_breakdown = p_counted_breakdown,
        cash_variance = v_counted - v_expected,
        closing_note = nullif(trim(coalesce(p_note, '')), '')
    where id = v_shift_id;

  return public.shift_summary(v_shift_id);
end;
$$;

revoke execute on function public.close_shift(numeric, jsonb, text) from public, anon;
grant execute on function public.close_shift(numeric, jsonb, text) to authenticated;


-- ============================================================
-- complete_order v2 — stamp the shift
--
-- Same behaviour as before, plus: the order is attached to the open
-- shift, and checkout is refused when no shift is open. Without that
-- rule, sales can be rung up outside any shift and the drawer can never
-- be reconciled. The Counter surfaces a one-tap "Open shift" so this is
-- a two-second action at open of business.
-- ============================================================

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
  v_shift_id uuid;
  v_tip numeric(10,2);
  v_subtotal numeric(10,2);
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
        shift_id = v_shift_id,
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


-- ============================================================
-- Realtime: keep the Counter's shift widget live
-- ============================================================

alter publication supabase_realtime add table public.shifts;
alter publication supabase_realtime add table public.cash_movements;
