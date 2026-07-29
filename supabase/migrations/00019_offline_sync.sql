-- ============================================================
-- Dos Tazas POS - Offline order sync
-- Run AFTER 00018_order_discounts.sql
--
-- The Floor/Counter can now build a cart, park it, and take payment with
-- no connection at all (see lib/offline/* and lib/pricing.ts on the
-- client). Everything queued there eventually replays here. This
-- migration adds:
--
--   1. An idempotency key (`client_uuid`) on orders and shifts, so a
--      retried sync is a clean no-op instead of a duplicate order.
--   2. A lenient pricing mode: the stock/sold-out/inactive guards in
--      _insert_priced_items, and the discount guards in complete_order's
--      arithmetic, downgrade from `raise exception` to a recorded warning
--      when the caller is a sync (the sale already happened; the till
--      already took the money — the software's job now is to record it
--      accurately and flag anything odd, never to lose it).
--   3. Two new RPCs: sync_offline_order (a cart parked and/or paid while
--      offline) and sync_offline_payment (an order that was created
--      online but paid during an outage).
--   4. A fix to next_order_number's day bucketing, which used the
--      database's UTC `current_date` while every reporting RPC already
--      converts to the shop's `location_settings.timezone` — offline
--      drain across local midnight made the mismatch worse, not just
--      theoretical.
--   5. An idempotency key on open_shift, carved out as the one queueable
--      non-order action: complete_order refuses payment with no shift
--      open, so a connection dropped before opening one would otherwise
--      be a total dead end for offline selling.
--
-- Deliberate design choice: orders.total_amount ends up holding what was
-- ACTUALLY CHARGED at the counter, not the server's re-priced figure.
-- shift_summary (00014) computes expected cash as sum(total_amount) where
-- payment_method = 'cash' — if a sync's server price differs from what
-- the till took (a menu change mid-outage, a race on a stock guard), using
-- the server figure there would make the drawer read short at close and
-- blame the cashier for a pricing race that was never their doing. The
-- server's own opinion of the price is preserved in server_total_amount,
-- the difference in sync_discrepancy, and full forensics in client_charge.
-- ============================================================


-- ============================================================
-- 1. Columns & indexes
-- ============================================================

alter table public.orders
  -- The idempotency key. Set once, client-side, at cart creation — every
  -- retry of the same sale (timeout-then-retry, reload-then-resume, a
  -- second tab) carries the same value.
  add column if not exists client_uuid          uuid,
  add column if not exists device_id            text,
  -- The "OFF-A7F3" printed on a provisional receipt, kept so it can still
  -- be matched to the real order_number after sync in the admin/queue UI.
  add column if not exists offline_ref          text,
  -- When the sale actually happened, reconstructed from the client's
  -- reported age at sync time (see sync_offline_order) rather than trusted
  -- device-clock timestamp. created_at, by contrast, stays "when this row
  -- was written" for every existing consumer that already depends on it.
  add column if not exists occurred_at          timestamptz,
  add column if not exists synced_at            timestamptz,
  -- What server-authoritative pricing says the order should have totalled.
  -- orders.total_amount itself holds what was charged (see header note).
  add column if not exists server_total_amount  numeric(10,2),
  -- Full breakdown of what the client actually charged, plus its pricing
  -- version — forensics for a discrepancy, never read by any live query.
  add column if not exists client_charge        jsonb,
  add column if not exists sync_discrepancy     numeric(10,2),
  -- Every guard that was downgraded from a hard error to a warning during
  -- this sync (sold out, understocked, discount reason missing, ...).
  add column if not exists sync_warnings        jsonb;

-- THE idempotency guard. Partial so the very large number of existing
-- online orders (client_uuid null) never collide with one another.
create unique index if not exists orders_client_uuid_key
  on public.orders (location_id, client_uuid)
  where client_uuid is not null;

-- "What needs a human's attention" — the query the admin sync panel runs.
create index if not exists orders_sync_flagged_idx
  on public.orders (location_id, created_at desc)
  where sync_discrepancy is not null and sync_discrepancy <> 0;

-- Backfill so occurred_at is never null going forward, and existing orders
-- report a sensible value if anything ever reads it before a sync happens.
update public.orders set occurred_at = created_at where occurred_at is null;

alter table public.shifts add column if not exists client_uuid uuid;
create unique index if not exists shifts_client_uuid_key
  on public.shifts (location_id, client_uuid)
  where client_uuid is not null;

-- order_audit already allows 'void' | 'refund' | 'discount' (00018). Add
-- the two sync actions: one row is always written on a sync ('offline_sync'),
-- and a second only when something was actually off ('sync_discrepancy') —
-- so the admin panel's query is `where action = 'sync_discrepancy'` rather
-- than a jsonb predicate over every sync row.
alter table public.order_audit drop constraint if exists order_audit_action_check;
alter table public.order_audit add constraint order_audit_action_check
  check (action in ('void', 'refund', 'discount', 'offline_sync', 'sync_discrepancy'));


-- ============================================================
-- 2. _price_checkout — complete_order's discount/IVA-resplit/tip math,
--    extracted so it has exactly one implementation instead of two
--    (SQL here, TS in lib/pricing.ts) growing into three (a lenient copy
--    inside the sync RPC). p_strict=true reproduces complete_order's
--    existing raises byte-for-byte; p_strict=false clamps and warns.
-- ============================================================

create or replace function public._price_checkout(
  p_gross numeric,          -- subtotal + tax at list price, tip excluded
  p_tax numeric,             -- the tax component of p_gross
  p_discount_type text,      -- 'percent' | 'amount' | null
  p_discount_value numeric,
  p_tip numeric,
  p_strict boolean default true,
  p_warnings jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_gross numeric(10,2) := coalesce(p_gross, 0);
  v_tax   numeric(10,2) := coalesce(p_tax, 0);
  v_tip   numeric(10,2) := greatest(0, coalesce(p_tip, 0));
  v_discount_value numeric(10,2) := greatest(0, coalesce(p_discount_value, 0));
  v_discount numeric(10,2) := 0;
  v_net_gross numeric(10,2);
  v_subtotal  numeric(10,2);
  v_total     numeric(10,2);
  v_warnings jsonb := coalesce(p_warnings, '[]'::jsonb);
begin
  if p_discount_type is not null and v_discount_value > 0 then
    if p_discount_type = 'percent' then
      if v_discount_value > 100 then
        if p_strict then
          raise exception 'A discount cannot exceed 100%%';
        end if;
        v_warnings := v_warnings || jsonb_build_object(
          'code', 'discount_over_100', 'value', v_discount_value);
        v_discount_value := 100;
      end if;
      v_discount := round(v_gross * v_discount_value / 100, 2);
    elsif p_discount_type = 'amount' then
      v_discount := round(v_discount_value, 2);
      if v_discount > v_gross then
        if p_strict then
          raise exception 'Discount is larger than the order total';
        end if;
        v_warnings := v_warnings || jsonb_build_object(
          'code', 'discount_exceeds_total', 'value', v_discount_value, 'gross', v_gross);
        v_discount := v_gross;
      end if;
    else
      raise exception 'Invalid discount type: %', p_discount_type;
    end if;
  end if;

  -- subtotal and tax start at list price; re-split proportionally if a
  -- discount applies (00018:178-183 — IVA owed is IVA on what the
  -- customer actually paid, not on the list price).
  v_subtotal := v_gross - v_tax;
  if v_discount > 0 and v_gross > 0 then
    v_net_gross := v_gross - v_discount;
    v_tax       := round(v_tax * v_net_gross / v_gross, 2);
    v_subtotal  := v_net_gross - v_tax;
  end if;

  v_total := v_subtotal + v_tax + v_tip;

  return jsonb_build_object(
    'discount_amount', v_discount,
    'subtotal', v_subtotal,
    'tax_amount', v_tax,
    'tip_amount', v_tip,
    'pre_tip_total', v_subtotal + v_tax,
    'total_amount', v_total,
    'warnings', v_warnings
  );
end;
$$;

revoke execute on function public._price_checkout(numeric, numeric, text, numeric, numeric, boolean, jsonb)
  from public, anon, authenticated;


-- ============================================================
-- 3. _insert_priced_items — same pricing engine, with p_strict=false
--    turning every stock/sold-out/inactive/modifier guard into a recorded
--    warning instead of a raise. The signature changes (two new trailing
--    params, both defaulted), so this must be dropped first: PL/pgSQL
--    function bodies aren't dependency-tracked, and create_order /
--    append_to_order are recreated below in this same file to keep that
--    explicit rather than relying on default-parameter call resolution.
-- ============================================================

drop function if exists public._insert_priced_items(uuid, jsonb, uuid);

create or replace function public._insert_priced_items(
  p_order_id uuid,
  items jsonb,
  p_location_id uuid,
  p_strict boolean default true,
  p_warnings jsonb default '[]'::jsonb
)
returns jsonb   -- the (possibly appended) warnings array
language plpgsql security definer
set search_path = public
as $$
declare
  v_tax_rate numeric(5,4);
  v_inclusive boolean;
  v_item jsonb;
  v_menu_item public.menu_items;
  v_qty integer;
  v_unit_extra numeric(10,2);
  v_unit_price numeric(10,2);
  v_line_total numeric(10,2);
  v_line_tax numeric(10,2);
  v_order_item_id uuid;
  v_opt_id uuid;
  v_opt record;
  v_agg record;
  v_warnings jsonb := coalesce(p_warnings, '[]'::jsonb);
begin
  select tax_rate, prices_include_tax into v_tax_rate, v_inclusive
    from public.location_settings where location_id = p_location_id;
  v_tax_rate := coalesce(v_tax_rate, 0.13);
  v_inclusive := coalesce(v_inclusive, true);

  -- Aggregate stock guard: sum all lines per item before writing anything.
  for v_agg in
    select
      mi.id,
      mi.name,
      mi.available_quantity,
      sum(greatest(1, coalesce((elem->>'quantity')::int, 1))) as total_qty
    from jsonb_array_elements(items) elem
    join public.menu_items mi
      on mi.id = (elem->>'menu_item_id')::uuid
     and mi.location_id = p_location_id
     and mi.is_active = true
    where mi.track_inventory = true
    group by mi.id, mi.name, mi.available_quantity
  loop
    if v_agg.available_quantity < v_agg.total_qty then
      if p_strict then
        raise exception 'Not enough stock for % (% left, % requested)',
          v_agg.name, v_agg.available_quantity, v_agg.total_qty;
      end if;
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'insufficient_stock', 'name', v_agg.name,
        'available', v_agg.available_quantity, 'requested', v_agg.total_qty);
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(items)
  loop
    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));

    select * into v_menu_item from public.menu_items
      where id = (v_item->>'menu_item_id')::uuid
        and location_id = p_location_id and is_active = true;

    if not found then
      if p_strict then
        raise exception 'Menu item % not available', v_item->>'menu_item_id';
      end if;

      -- Distinguish "just inactive" (still price it, at the stored price)
      -- from "genuinely gone" (nothing to price against — skip the line,
      -- the money it represents is what sync_discrepancy is for).
      select * into v_menu_item from public.menu_items
        where id = (v_item->>'menu_item_id')::uuid and location_id = p_location_id;
      if not found then
        v_warnings := v_warnings || jsonb_build_object(
          'code', 'menu_item_missing', 'menu_item_id', v_item->>'menu_item_id',
          'quantity', v_qty);
        continue;
      end if;
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'item_inactive', 'name', v_menu_item.name);
    end if;

    if not v_menu_item.is_available then
      if p_strict then
        raise exception '% is sold out', v_menu_item.name;
      end if;
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'item_sold_out', 'name', v_menu_item.name);
    end if;

    -- Per-line safety net (aggregate check above is the primary guard).
    if v_menu_item.track_inventory and v_menu_item.available_quantity < v_qty then
      if p_strict then
        raise exception 'Not enough stock for % (% left)', v_menu_item.name, v_menu_item.available_quantity;
      end if;
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'insufficient_stock', 'name', v_menu_item.name,
        'available', v_menu_item.available_quantity, 'requested', v_qty);
    end if;

    v_unit_extra := 0;
    insert into public.order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes)
      values (p_order_id, v_menu_item.id, v_qty, 0, 0, nullif(v_item->>'notes', ''))
      returning id into v_order_item_id;

    if v_item ? 'modifier_option_ids' then
      for v_opt_id in
        select (value)::uuid from jsonb_array_elements_text(v_item->'modifier_option_ids')
      loop
        -- Require the option's modifier to be explicitly linked to this item.
        select mo.id, mo.name, mo.extra_price, m.name as modifier_name into v_opt
          from public.modifier_options mo
          join public.modifiers m on m.id = mo.modifier_id
          join public.menu_item_modifiers mim
            on mim.modifier_id = mo.modifier_id
           and mim.menu_item_id = v_menu_item.id
          where mo.id = v_opt_id and m.location_id = p_location_id;

        if not found then
          if p_strict then
            raise exception 'Modifier option % is not valid for item %',
              v_opt_id, v_menu_item.name;
          end if;

          -- Not linked to this item — or the link is gone — but the
          -- option itself might still exist. Price it if so; skip it
          -- entirely (no charge, no phantom order_item_modifiers row) if
          -- the option row itself is gone.
          select mo.id, mo.name, mo.extra_price, m.name as modifier_name into v_opt
            from public.modifier_options mo
            join public.modifiers m on m.id = mo.modifier_id
            where mo.id = v_opt_id and m.location_id = p_location_id;
          if not found then
            v_warnings := v_warnings || jsonb_build_object(
              'code', 'modifier_missing', 'modifier_option_id', v_opt_id);
            continue;
          end if;
          v_warnings := v_warnings || jsonb_build_object(
            'code', 'modifier_not_linked', 'name', v_opt.name, 'item', v_menu_item.name);
        end if;

        v_unit_extra := v_unit_extra + v_opt.extra_price;
        insert into public.order_item_modifiers (order_item_id, modifier_option_id, name, extra_price)
          values (v_order_item_id, v_opt.id, v_opt.modifier_name || ': ' || v_opt.name, v_opt.extra_price);
      end loop;
    end if;

    v_unit_price := v_menu_item.price + v_unit_extra;
    v_line_total := v_unit_price * v_qty;
    if v_inclusive then
      v_line_tax := round(v_line_total - (v_line_total / (1 + v_tax_rate)), 2);
    else
      v_line_tax := round(v_line_total * v_tax_rate, 2);
    end if;

    update public.order_items
      set unit_price = v_unit_price,
          total_price = case when v_inclusive then v_line_total else v_line_total + v_line_tax end,
          tax_amount = v_line_tax
      where id = v_order_item_id;
  end loop;

  return v_warnings;
end;
$$;

-- Recompute an order's money breakdown from its current order_items.
-- Unchanged from 00013 — included only because it sits between the two
-- functions above and below in the original file's reading order.
create or replace function public._recompute_order_totals(p_order_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.orders o set
    subtotal = coalesce((select sum(total_price - tax_amount) from public.order_items where order_id = p_order_id), 0),
    tax_amount = coalesce((select sum(tax_amount) from public.order_items where order_id = p_order_id), 0),
    total_amount = coalesce((select sum(total_price) from public.order_items where order_id = p_order_id), 0)
  where o.id = p_order_id;
end;
$$;


-- ============================================================
-- 4. next_order_number — fix the timezone bug.
--
-- current_date is the DATABASE's date (UTC), while sales_summary and
-- orders_for_export both bucket on location_settings.timezone (00015,
-- 00018). An order rung at 23:50 local and synced at 00:10 local — an
-- entirely normal offline-drain scenario — landed on tomorrow's counter
-- under the old current_date. Signature changes (new optional p_at), so
-- drop first for the same dependency-tracking reason as above.
-- ============================================================

drop function if exists public.next_order_number(uuid);

create or replace function public.next_order_number(
  p_location_id uuid,
  p_at timestamptz default now()
)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_tz text;
  v_date date;
  v_number integer;
begin
  select coalesce(timezone, 'America/Costa_Rica') into v_tz
    from public.location_settings where location_id = p_location_id;
  v_date := (coalesce(p_at, now()) at time zone coalesce(v_tz, 'America/Costa_Rica'))::date;

  insert into public.order_counters (location_id, order_date, last_number)
    values (p_location_id, v_date, 1)
  on conflict (location_id, order_date)
    do update set last_number = public.order_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$;

revoke execute on function public.next_order_number(uuid, timestamptz) from public, anon, authenticated;


-- ============================================================
-- 5. create_order / append_to_order — recreated with the same signature
--    and behaviour, only now calling the new _insert_priced_items with
--    p_strict => true explicit (rather than relying on its default).
-- ============================================================

create or replace function public.create_order(items jsonb, p_table_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_user_id uuid;
  v_order_id uuid;
  v_order_number integer;
  v_tax_rate numeric(5,4);
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select location_id into v_location_id from public.user_profiles where id = v_user_id;
  if v_location_id is null then raise exception 'No location for user'; end if;

  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Order has no items';
  end if;

  if p_table_id is not null and not exists (
    select 1 from public.tables where id = p_table_id and location_id = v_location_id
  ) then
    raise exception 'Invalid table';
  end if;

  select coalesce(tax_rate, 0.13) into v_tax_rate
    from public.location_settings where location_id = v_location_id;
  v_tax_rate := coalesce(v_tax_rate, 0.13);

  v_order_number := public.next_order_number(v_location_id);

  insert into public.orders (location_id, user_id, status, order_number, tax_rate, total_amount, table_id, occurred_at)
    values (v_location_id, v_user_id, 'draft', v_order_number, v_tax_rate, 0, p_table_id, now())
    returning id into v_order_id;

  perform public._insert_priced_items(v_order_id, items, v_location_id, true, '[]'::jsonb);
  perform public._recompute_order_totals(v_order_id);

  update public.orders set status = 'parked' where id = v_order_id;
  return v_order_id;
end;
$$;

create or replace function public.append_to_order(p_order_id uuid, items jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_location_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_location_id := public.get_current_location_id();

  if not exists (
    select 1 from public.orders
    where id = p_order_id and location_id = v_location_id and status = 'parked'
  ) then
    raise exception 'Open order not found';
  end if;

  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'No items to add';
  end if;

  perform public._insert_priced_items(p_order_id, items, v_location_id, true, '[]'::jsonb);
  perform public._recompute_order_totals(p_order_id);
end;
$$;


-- ============================================================
-- 6. complete_order — same 11-arg signature (do not create an overload:
--    00018:79 documents PostgREST's inability to resolve ambiguous
--    overloads), lines 149-187 of the previous version replaced by a
--    strict call into _price_checkout. Behaviour is byte-identical.
-- ============================================================

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
  v_subtotal numeric(10,2);
  v_tax numeric(10,2);
  v_gross numeric(10,2);
  v_reason text;
  v_math jsonb;
  v_discount numeric(10,2);
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

  v_subtotal := coalesce(nullif(v_order.subtotal, 0), v_order.total_amount, 0);
  v_tax := v_order.tax_amount;

  -- What the order is worth at list price, tax included, before any tip.
  v_gross := v_subtotal + v_tax;

  v_reason := nullif(trim(coalesce(p_discount_reason, '')), '');

  -- _price_checkout raises on an invalid type/an over-100%/an
  -- over-gross discount in strict mode; the "reason required" check
  -- below still runs after it, exactly as the original ordering did,
  -- and against the COMPUTED discount amount (not the raw input) —
  -- an input that rounds down to zero must not demand a reason.
  v_math := public._price_checkout(
    v_gross, v_tax, p_discount_type, p_discount_value, p_tip_amount, true, '[]'::jsonb
  );
  v_discount := (v_math->>'discount_amount')::numeric;
  v_subtotal := (v_math->>'subtotal')::numeric;
  v_tax      := (v_math->>'tax_amount')::numeric;
  v_total    := (v_math->>'total_amount')::numeric;

  if v_discount > 0 and v_reason is null then
    raise exception 'A reason is required to apply a discount';
  end if;

  -- A reason with no discount is just a stray note; drop it so the audit
  -- and the receipt do not claim a discount that was never given.
  if v_discount = 0 then
    v_reason := null;
  end if;

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
        tip_amount = (v_math->>'tip_amount')::numeric,
        subtotal = v_subtotal,
        tax_amount = v_tax,
        discount_amount = v_discount,
        discount_reason = v_reason,
        total_amount = v_total,
        server_total_amount = v_total,
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
-- 7. sync_offline_order — a cart created offline, parked and/or paid.
--
-- Payload shapes (documented here rather than duplicated at every call
-- site — see lib/offline/types.ts for the TS mirror):
--
--   p_payment = {
--     "payment_method": "cash|card|sinpe", "payment_reference": null,
--     "tip_amount": 0, "amount_tendered": null,
--     "customer_name": null, "customer_id": null, "customer_email": null,
--     "discount_type": null, "discount_value": 0, "discount_reason": null
--   }
--   null p_payment => park only, no money changed hands yet.
--
--   p_client_charge = {
--     "subtotal": 0, "taxAmount": 0, "discountAmount": 0, "tipAmount": 0,
--     "totalAmount": 0, "amountTendered": null, "changeDue": null,
--     "pricingVersion": "2026-07-28-a"
--   }
--
-- Returns:
--   { "order_id", "order_number", "status", "replayed", "total_amount",
--     "server_total_amount", "discrepancy", "warnings" }
--   or, on a table-tab conflict caught before insert, that same shape
--   with an extra "table_id": null and a "table_tab_conflict" warning.
--   or, on the case-13 double-payment collision (see sync_offline_payment
--   below for the symmetric case), a "conflict" key describing it.
-- ============================================================

create or replace function public.sync_offline_order(
  p_client_uuid        uuid,
  p_items              jsonb,
  p_offline_ref        text     default null,
  p_device_id          text     default null,
  p_table_id           uuid     default null,
  p_client_age_seconds numeric  default 0,
  p_expected_shift_id  uuid     default null,
  p_payment            jsonb    default null,   -- null => park only
  p_client_charge      jsonb    default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_existing public.orders;
  v_age numeric;
  v_occurred timestamptz;
  v_table_id uuid;
  v_shift_id uuid;
  v_order_id uuid;
  v_order_number integer;
  v_tax_rate numeric(5,4);
  v_warnings jsonb := '[]'::jsonb;
  v_gross numeric(10,2);
  v_tax numeric(10,2);
  v_math jsonb;
  v_server_total numeric(10,2);
  v_client_total numeric(10,2);
  v_charged_gross numeric(10,2);
  v_tax_final numeric(10,2);
  v_subtotal_final numeric(10,2);
  v_total_final numeric(10,2);
  v_discrepancy numeric(10,2);
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_client_uuid is null then
    raise exception 'client_uuid is required';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Order has no items';
  end if;

  v_location_id := public.get_current_location_id();

  -- ── Replay short-circuit — the primary dedup. A replay is always a
  -- clean success, never an error: the entire client retry story depends
  -- on this being true. ─────────────────────────────────────────────
  select * into v_existing from public.orders
    where location_id = v_location_id and client_uuid = p_client_uuid;
  if found then
    return jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'status', v_existing.status,
      'replayed', true,
      'total_amount', v_existing.total_amount,
      'server_total_amount', v_existing.server_total_amount,
      'discrepancy', coalesce(v_existing.sync_discrepancy, 0),
      'warnings', coalesce(v_existing.sync_warnings, '[]'::jsonb)
    );
  end if;

  -- ── Reconstruct occurrence time from an AGE, not a device timestamp —
  -- immune to clock skew. Clamp to 48h so a wildly wrong device clock
  -- can't land a sale in the far past or future. ─────────────────────
  v_age := least(greatest(coalesce(p_client_age_seconds, 0), 0), 172800);
  if v_age <> coalesce(p_client_age_seconds, 0) then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'clock_clamped', 'sent', p_client_age_seconds);
  end if;
  v_occurred := now() - make_interval(secs => v_age);

  -- ── Table-tab collision: two devices parked a tab on the same table
  -- while both offline. Pre-checked rather than caught off the unique
  -- index, so it stays distinguishable from the client_uuid race below.
  -- Only relevant when this will end up 'parked' — a create-and-pay never
  -- touches that status, so it can't trip the partial index at all.
  -- Deliberately NOT merged into the existing tab: silently absorbing one
  -- table's items into another's bill is worse than two tickets a human
  -- reconciles. ───────────────────────────────────────────────────────
  v_table_id := p_table_id;
  if p_table_id is not null and p_payment is null and exists (
    select 1 from public.orders
     where table_id = p_table_id and status = 'parked' and location_id = v_location_id
  ) then
    v_table_id := null;
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'table_tab_conflict', 'table_id', p_table_id);
  end if;

  if v_table_id is not null and not exists (
    select 1 from public.tables where id = v_table_id and location_id = v_location_id
  ) then
    v_table_id := null;
    v_warnings := v_warnings || jsonb_build_object('code', 'table_missing');
  end if;

  -- ── Shift: current_shift_id() may legitimately be null (device
  -- reopened the next morning with nobody having opened a shift yet).
  -- Never raise — warn, and let the order land with shift_id null rather
  -- than losing the sale. ─────────────────────────────────────────────
  v_shift_id := public.current_shift_id();
  if v_shift_id is null then
    v_warnings := v_warnings || jsonb_build_object('code', 'no_shift_at_sync');
  elsif p_expected_shift_id is not null and p_expected_shift_id <> v_shift_id then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'shift_changed', 'expected', p_expected_shift_id, 'actual', v_shift_id);
  end if;

  select coalesce(tax_rate, 0.13) into v_tax_rate
    from public.location_settings where location_id = v_location_id;
  v_tax_rate := coalesce(v_tax_rate, 0.13);

  -- ── Insert. Status stays 'draft' until we know whether this ends
  -- 'parked' or 'completed' below — never passing through 'parked' at
  -- all for a create-and-pay, so the partial unique index above is never
  -- at risk of tripping on a sale that's about to be paid anyway.
  -- The insert itself is the second dedup layer: if two concurrent drains
  -- both slipped past the replay check above, the unique index on
  -- (location_id, client_uuid) catches the loser here. ────────────────
  begin
    insert into public.orders (
      location_id, user_id, status, order_number, tax_rate, total_amount,
      table_id, client_uuid, device_id, offline_ref, occurred_at, created_at
    )
    values (
      v_location_id, auth.uid(), 'draft',
      public.next_order_number(v_location_id, v_occurred),
      v_tax_rate, 0,
      v_table_id, p_client_uuid, p_device_id, p_offline_ref, v_occurred, v_occurred
    )
    returning id into v_order_id;
  exception when unique_violation then
    select * into v_existing from public.orders
      where location_id = v_location_id and client_uuid = p_client_uuid;
    return jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'status', v_existing.status,
      'replayed', true,
      'total_amount', v_existing.total_amount,
      'server_total_amount', v_existing.server_total_amount,
      'discrepancy', coalesce(v_existing.sync_discrepancy, 0),
      'warnings', coalesce(v_existing.sync_warnings, '[]'::jsonb)
    );
  end;

  v_warnings := public._insert_priced_items(v_order_id, p_items, v_location_id, false, v_warnings);
  perform public._recompute_order_totals(v_order_id);

  select subtotal, tax_amount into v_gross, v_tax from public.orders where id = v_order_id;
  v_gross := v_gross + v_tax;

  if p_payment is null then
    -- Park only — nothing was charged yet.
    update public.orders
      set status = 'parked', synced_at = now(), sync_warnings = v_warnings
      where id = v_order_id;

    insert into public.order_audit (order_id, location_id, action, actor_id, reason, order_snapshot)
      values (v_order_id, v_location_id, 'offline_sync', auth.uid(), null,
        jsonb_build_object('offline_ref', p_offline_ref, 'device_id', p_device_id, 'warnings', v_warnings));

    select order_number, total_amount into v_order_number, v_total_final
      from public.orders where id = v_order_id;
    return jsonb_build_object(
      'order_id', v_order_id, 'order_number', v_order_number, 'status', 'parked',
      'replayed', false, 'total_amount', v_total_final, 'server_total_amount', v_total_final,
      'discrepancy', 0, 'warnings', v_warnings
    );
  end if;

  -- ── Payment attached — the lenient checkout. Same discount/IVA/tip
  -- math as complete_order, but every guard below is a warning: the
  -- customer already paid and left with the coffee. ───────────────────
  v_reason := nullif(trim(coalesce(p_payment->>'discount_reason', '')), '');
  if coalesce((p_payment->>'discount_value')::numeric, 0) > 0
     and v_reason is null and (p_payment->>'discount_type') is not null then
    v_reason := '(offline: no reason recorded)';
    v_warnings := v_warnings || jsonb_build_object('code', 'discount_reason_missing');
  end if;

  if p_payment->>'payment_method' not in ('card', 'cash', 'sinpe') then
    raise exception 'Invalid payment method';
  end if;
  if p_payment->>'payment_method' = 'sinpe'
     and coalesce(p_payment->>'payment_reference', '') = '' then
    v_warnings := v_warnings || jsonb_build_object('code', 'sinpe_reference_missing');
  end if;

  v_math := public._price_checkout(
    v_gross, v_tax, p_payment->>'discount_type',
    (p_payment->>'discount_value')::numeric, (p_payment->>'tip_amount')::numeric,
    false, v_warnings
  );
  v_warnings := v_math->'warnings';
  v_server_total := (v_math->>'total_amount')::numeric;

  v_client_total := coalesce((p_client_charge->>'totalAmount')::numeric, v_server_total);

  if p_payment->>'payment_method' = 'cash' then
    if (p_payment->>'amount_tendered') is null
       or (p_payment->>'amount_tendered')::numeric < v_client_total then
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'tendered_short', 'tendered', p_payment->>'amount_tendered', 'total', v_client_total);
    end if;
  end if;

  -- Reconcile what the till actually took against what server-authoritative
  -- pricing says it should have been. total_amount = what was charged (see
  -- header note); server_total_amount + sync_discrepancy carry the server's
  -- opinion so nothing is silently lost.
  if abs(v_server_total - v_client_total) >= 0.01 then
    v_charged_gross  := v_client_total - (v_math->>'tip_amount')::numeric;
    v_tax_final      := case when v_gross > 0 then round(v_tax * v_charged_gross / v_gross, 2) else 0 end;
    v_subtotal_final := v_charged_gross - v_tax_final;
    v_total_final    := v_client_total;
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'total_mismatch', 'server', v_server_total, 'client', v_client_total);
  else
    v_subtotal_final := (v_math->>'subtotal')::numeric;
    v_tax_final      := (v_math->>'tax_amount')::numeric;
    v_total_final    := v_server_total;
  end if;
  v_discrepancy := round(v_server_total - v_total_final, 2);

  update public.orders
    set status = 'completed',
        shift_id = v_shift_id,
        payment_method = p_payment->>'payment_method',
        payment_reference = p_payment->>'payment_reference',
        tip_amount = (v_math->>'tip_amount')::numeric,
        subtotal = v_subtotal_final,
        tax_amount = v_tax_final,
        discount_amount = (v_math->>'discount_amount')::numeric,
        discount_reason = case when (v_math->>'discount_amount')::numeric > 0 then v_reason else null end,
        total_amount = v_total_final,
        server_total_amount = v_server_total,
        sync_discrepancy = v_discrepancy,
        client_charge = p_client_charge,
        amount_tendered = case when p_payment->>'payment_method' = 'cash'
                            then (p_payment->>'amount_tendered')::numeric else null end,
        change_due = case when p_payment->>'payment_method' = 'cash'
                       then round(coalesce((p_payment->>'amount_tendered')::numeric, 0) - v_total_final, 2)
                       else null end,
        customer_name = p_payment->>'customer_name',
        customer_id = p_payment->>'customer_id',
        customer_email = p_payment->>'customer_email',
        synced_at = now(),
        sync_warnings = v_warnings
    where id = v_order_id;

  update public.menu_items mi
    set available_quantity = greatest(0, mi.available_quantity - oi.qty)
    from (
      select menu_item_id, sum(quantity) as qty
      from public.order_items where order_id = v_order_id group by menu_item_id
    ) oi
    where mi.id = oi.menu_item_id and mi.track_inventory = true;

  insert into public.order_audit (order_id, location_id, action, actor_id, reason, order_snapshot)
    values (v_order_id, v_location_id, 'offline_sync', auth.uid(), v_reason,
      jsonb_build_object(
        'client_charge', p_client_charge, 'server_total', v_server_total,
        'warnings', v_warnings, 'offline_ref', p_offline_ref, 'device_id', p_device_id
      ));

  if v_discrepancy <> 0 or jsonb_array_length(v_warnings) > 0 then
    insert into public.order_audit (order_id, location_id, action, actor_id, reason, order_snapshot)
      values (v_order_id, v_location_id, 'sync_discrepancy', auth.uid(), null,
        jsonb_build_object(
          'server_total', v_server_total, 'charged_total', v_total_final,
          'discrepancy', v_discrepancy, 'warnings', v_warnings
        ));
  end if;

  select order_number into v_order_number from public.orders where id = v_order_id;
  return jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number, 'status', 'completed',
    'replayed', false, 'total_amount', v_total_final, 'server_total_amount', v_server_total,
    'discrepancy', v_discrepancy, 'warnings', v_warnings
  );
end;
$$;


-- ============================================================
-- 8. sync_offline_payment — an order created ONLINE, paid during an
-- outage. Reuses orders.client_uuid for idempotency (null on an
-- online-created order, so setting it here at payment time is free).
-- ============================================================

create or replace function public.sync_offline_payment(
  p_order_id           uuid,
  p_client_uuid        uuid,
  p_client_age_seconds numeric  default 0,
  p_expected_shift_id  uuid     default null,
  p_payment            jsonb    default null,
  p_client_charge      jsonb    default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_order public.orders;
  v_shift_id uuid;
  v_gross numeric(10,2);
  v_tax numeric(10,2);
  v_math jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_server_total numeric(10,2);
  v_client_total numeric(10,2);
  v_charged_gross numeric(10,2);
  v_tax_final numeric(10,2);
  v_subtotal_final numeric(10,2);
  v_total_final numeric(10,2);
  v_discrepancy numeric(10,2);
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_client_uuid is null then
    raise exception 'client_uuid is required';
  end if;
  if p_payment is null then
    raise exception 'Payment details are required';
  end if;

  v_location_id := public.get_current_location_id();

  select * into v_order from public.orders
    where id = p_order_id and location_id = v_location_id;
  if not found then
    raise exception 'Order not found';
  end if;

  -- Our own replay.
  if v_order.client_uuid = p_client_uuid then
    return jsonb_build_object(
      'order_id', v_order.id, 'order_number', v_order.order_number, 'status', v_order.status,
      'replayed', true, 'total_amount', v_order.total_amount,
      'server_total_amount', v_order.server_total_amount,
      'discrepancy', coalesce(v_order.sync_discrepancy, 0),
      'warnings', coalesce(v_order.sync_warnings, '[]'::jsonb)
    );
  end if;

  -- Someone else already paid this order — offline, on another device.
  -- Money was genuinely taken twice in the real world; say so loudly
  -- rather than silently succeeding a second time.
  if v_order.status = 'completed' then
    return jsonb_build_object(
      'conflict', 'already_paid', 'order_id', v_order.id,
      'order_number', v_order.order_number, 'paid_total', v_order.total_amount
    );
  end if;
  if v_order.status <> 'parked' then
    return jsonb_build_object('conflict', 'not_parked', 'order_id', v_order.id, 'status', v_order.status);
  end if;

  v_shift_id := public.current_shift_id();
  if v_shift_id is null then
    v_warnings := v_warnings || jsonb_build_object('code', 'no_shift_at_sync');
  elsif p_expected_shift_id is not null and p_expected_shift_id <> v_shift_id then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'shift_changed', 'expected', p_expected_shift_id, 'actual', v_shift_id);
  end if;

  v_gross := coalesce(nullif(v_order.subtotal, 0), v_order.total_amount, 0) + v_order.tax_amount;
  v_tax := v_order.tax_amount;

  v_reason := nullif(trim(coalesce(p_payment->>'discount_reason', '')), '');
  if coalesce((p_payment->>'discount_value')::numeric, 0) > 0
     and v_reason is null and (p_payment->>'discount_type') is not null then
    v_reason := '(offline: no reason recorded)';
    v_warnings := v_warnings || jsonb_build_object('code', 'discount_reason_missing');
  end if;

  if p_payment->>'payment_method' not in ('card', 'cash', 'sinpe') then
    raise exception 'Invalid payment method';
  end if;
  if p_payment->>'payment_method' = 'sinpe'
     and coalesce(p_payment->>'payment_reference', '') = '' then
    v_warnings := v_warnings || jsonb_build_object('code', 'sinpe_reference_missing');
  end if;

  v_math := public._price_checkout(
    v_gross, v_tax, p_payment->>'discount_type',
    (p_payment->>'discount_value')::numeric, (p_payment->>'tip_amount')::numeric,
    false, v_warnings
  );
  v_warnings := v_math->'warnings';
  v_server_total := (v_math->>'total_amount')::numeric;
  v_client_total := coalesce((p_client_charge->>'totalAmount')::numeric, v_server_total);

  if p_payment->>'payment_method' = 'cash' then
    if (p_payment->>'amount_tendered') is null
       or (p_payment->>'amount_tendered')::numeric < v_client_total then
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'tendered_short', 'tendered', p_payment->>'amount_tendered', 'total', v_client_total);
    end if;
  end if;

  if abs(v_server_total - v_client_total) >= 0.01 then
    v_charged_gross  := v_client_total - (v_math->>'tip_amount')::numeric;
    v_tax_final      := case when v_gross > 0 then round(v_tax * v_charged_gross / v_gross, 2) else 0 end;
    v_subtotal_final := v_charged_gross - v_tax_final;
    v_total_final    := v_client_total;
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'total_mismatch', 'server', v_server_total, 'client', v_client_total);
  else
    v_subtotal_final := (v_math->>'subtotal')::numeric;
    v_tax_final      := (v_math->>'tax_amount')::numeric;
    v_total_final    := v_server_total;
  end if;
  v_discrepancy := round(v_server_total - v_total_final, 2);

  update public.orders
    set status = 'completed',
        shift_id = v_shift_id,
        client_uuid = p_client_uuid,
        payment_method = p_payment->>'payment_method',
        payment_reference = p_payment->>'payment_reference',
        tip_amount = (v_math->>'tip_amount')::numeric,
        subtotal = v_subtotal_final,
        tax_amount = v_tax_final,
        discount_amount = (v_math->>'discount_amount')::numeric,
        discount_reason = case when (v_math->>'discount_amount')::numeric > 0 then v_reason else null end,
        total_amount = v_total_final,
        server_total_amount = v_server_total,
        sync_discrepancy = v_discrepancy,
        client_charge = p_client_charge,
        amount_tendered = case when p_payment->>'payment_method' = 'cash'
                            then (p_payment->>'amount_tendered')::numeric else null end,
        change_due = case when p_payment->>'payment_method' = 'cash'
                       then round(coalesce((p_payment->>'amount_tendered')::numeric, 0) - v_total_final, 2)
                       else null end,
        customer_name = p_payment->>'customer_name',
        customer_id = p_payment->>'customer_id',
        customer_email = p_payment->>'customer_email',
        synced_at = now(),
        sync_warnings = v_warnings
    where id = p_order_id;

  update public.menu_items mi
    set available_quantity = greatest(0, mi.available_quantity - oi.qty)
    from (
      select menu_item_id, sum(quantity) as qty
      from public.order_items where order_id = p_order_id group by menu_item_id
    ) oi
    where mi.id = oi.menu_item_id and mi.track_inventory = true;

  insert into public.order_audit (order_id, location_id, action, actor_id, reason, order_snapshot)
    values (p_order_id, v_location_id, 'offline_sync', auth.uid(), v_reason,
      jsonb_build_object('client_charge', p_client_charge, 'server_total', v_server_total, 'warnings', v_warnings));

  if v_discrepancy <> 0 or jsonb_array_length(v_warnings) > 0 then
    insert into public.order_audit (order_id, location_id, action, actor_id, reason, order_snapshot)
      values (p_order_id, v_location_id, 'sync_discrepancy', auth.uid(), null,
        jsonb_build_object(
          'server_total', v_server_total, 'charged_total', v_total_final,
          'discrepancy', v_discrepancy, 'warnings', v_warnings
        ));
  end if;

  return jsonb_build_object(
    'order_id', p_order_id, 'order_number', v_order.order_number, 'status', 'completed',
    'replayed', false, 'total_amount', v_total_final, 'server_total_amount', v_server_total,
    'discrepancy', v_discrepancy, 'warnings', v_warnings
  );
end;
$$;


-- ============================================================
-- 9. open_shift — add an idempotency key. Carved out as the one
-- queueable non-order action: complete_order refuses payment with no
-- shift open, so a connection dropped before opening one would otherwise
-- be a total dead end for offline selling (every other till action —
-- close, cash movements, void, refund — stays online-only).
-- ============================================================

drop function if exists public.open_shift(numeric);

create or replace function public.open_shift(
  p_opening_float numeric default 0,
  p_client_uuid uuid default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_shift_id uuid;
  v_existing public.shifts;
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

  if p_client_uuid is not null then
    select * into v_existing from public.shifts
      where location_id = v_location_id and client_uuid = p_client_uuid;
    if found then
      return v_existing.id;   -- replay: clean no-op
    end if;
  end if;

  if exists (
    select 1 from public.shifts
      where location_id = v_location_id and status = 'open'
  ) then
    if p_client_uuid is not null then
      -- Queued offline: some shift is what a queued sale needs. Hand back
      -- the one that's already open rather than stranding the sale behind
      -- a raise nobody queued a fix for.
      select id into v_shift_id from public.shifts
        where location_id = v_location_id and status = 'open' limit 1;
      return v_shift_id;
    end if;
    raise exception 'A shift is already open. Close it before opening a new one.';
  end if;

  begin
    insert into public.shifts (location_id, opened_by, opening_float, client_uuid)
      values (v_location_id, auth.uid(), round(p_opening_float), p_client_uuid)
      returning id into v_shift_id;
  exception when unique_violation then
    -- Two possible races landed us here: another concurrent call with the
    -- SAME client_uuid won (true replay — find our own row), or another
    -- concurrent call opened a DIFFERENT shift first and tripped
    -- shifts_one_open_per_location instead (find whatever is open now).
    -- Either way, the caller just needs *a* shift id back, never null.
    if p_client_uuid is not null then
      select id into v_shift_id from public.shifts
        where location_id = v_location_id and client_uuid = p_client_uuid;
    end if;
    if v_shift_id is null then
      select id into v_shift_id from public.shifts
        where location_id = v_location_id and status = 'open' limit 1;
    end if;
  end;

  return v_shift_id;
end;
$$;

revoke execute on function public.open_shift(numeric, uuid) from public, anon;
grant execute on function public.open_shift(numeric, uuid) to authenticated;


-- ============================================================
-- 10. Grants
-- ============================================================

revoke execute on function public._insert_priced_items(uuid, jsonb, uuid, boolean, jsonb)
  from public, anon, authenticated;
revoke execute on function public._recompute_order_totals(uuid) from public, anon, authenticated;
revoke execute on function public.create_order(jsonb, uuid) from public, anon;
revoke execute on function public.append_to_order(uuid, jsonb) from public, anon;
grant execute on function public.create_order(jsonb, uuid) to authenticated;
grant execute on function public.append_to_order(uuid, jsonb) to authenticated;

revoke execute on function public.sync_offline_order(
  uuid, jsonb, text, text, uuid, numeric, uuid, jsonb, jsonb
) from public, anon;
grant execute on function public.sync_offline_order(
  uuid, jsonb, text, text, uuid, numeric, uuid, jsonb, jsonb
) to authenticated;

revoke execute on function public.sync_offline_payment(
  uuid, uuid, numeric, uuid, jsonb, jsonb
) from public, anon;
grant execute on function public.sync_offline_payment(
  uuid, uuid, numeric, uuid, jsonb, jsonb
) to authenticated;
