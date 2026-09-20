-- ============================================================
-- Dos Tazas POS — order service type + table-service charge (servicio)
-- Run AFTER 00033_sales_summary_v2.sql
--
-- Until now an order's service type was only IMPLIED by table_id: null
-- read as "takeaway", non-null printed the table's name. That inference
-- is not something we can charge money on — an admin deleting a table
-- silently turns its orders into takeaway (settings.tables.deleteConfirm
-- says so out loud) — so service type becomes an explicit column, and
-- the table-service percentage becomes a location setting.
--
-- ── How the servicio is priced ──────────────────────────────
--
-- It is subject to IVA and quoted IVA-inclusive, exactly like a menu
-- price, and it is taken on the POST-DISCOUNT gross with the tip
-- excluded: comping a coffee reduces the servicio with it, and a tip
-- never compounds on top of a service charge.
--
--   service_charge_amount = round(pre_tip_total * rate, 2)      -- gross
--   service_charge_tax    = round(gross - gross/(1+tax_rate), 2)
--   net                   = gross - tax
--
-- One formula covers both prices_include_tax settings.
-- _insert_priced_items leaves sum(total_price) = net*(1+r) either way
-- (inclusive: total_price = lineTotal; exclusive: lineTotal + line tax),
-- so the p_gross reaching _price_checkout is always IVA-inclusive, and
-- splitting the servicio inclusively gives the same colones as
-- "rate * net, then add IVA".
--
-- ── Why the servicio is FOLDED, not a fourth term ───────────
--
-- The net part lands in orders.subtotal and the IVA part in
-- orders.tax_amount, so 00018:29-31's invariant
--
--     total_amount = subtotal + tax_amount + tip_amount
--
-- survives untouched and every reporting RPC keeps reconciling.
-- service_charge_amount stores the gross for display and for its own
-- reported line. The servicio IS taxable revenue, so it is reported
-- beside tips rather than being subtracted out of net sales.
--
-- ── The invariant this migration adds ───────────────────────
--
--     service_charge_amount is written ONLY by the transitions into
--     'completed'. A PARKED ORDER ALWAYS CARRIES 0.
--
-- That is what keeps `subtotal + tax_amount` meaning "list gross of the
-- items" everywhere it is reconstructed from a parked order
-- (app/pos/counter/page.tsx:116), and it is the only reason
-- append_to_order — which calls _recompute_order_totals, and that
-- overwrites subtotal/tax_amount wholesale — needs no change here.
-- ============================================================


-- ============================================================
-- 1. Schema
-- ============================================================

-- Default-off: an existing shop prices exactly as it did yesterday
-- until an admin turns the servicio on.
alter table public.location_settings
  add column if not exists table_service_enabled boolean not null default false,
  add column if not exists table_service_rate numeric(5,4) not null default 0.10;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'location_settings_table_service_rate_check'
  ) then
    alter table public.location_settings
      add constraint location_settings_table_service_rate_check
      check (table_service_rate >= 0 and table_service_rate <= 1);
  end if;
end $$;

alter table public.orders
  -- Snapshotted at create_order time the way tax_rate is (00026:51-52),
  -- so changing the setting never re-prices a tab already on the floor.
  add column if not exists service_charge_rate numeric(5,4) not null default 0,
  -- The IVA-INCLUSIVE gross servicio actually charged.
  add column if not exists service_charge_amount numeric(10,2) not null default 0,
  -- Stored rather than re-derived: re-splitting at read time re-does the
  -- rounding and can drift a colon from what was charged, and
  -- sales_summary below needs the net to undo the fold exactly.
  add column if not exists service_charge_tax numeric(10,2) not null default 0,
  -- "Charged 0 because the cashier waived it" is a different fact from
  -- "charged 0 because it was takeaway", and only one of them is worth
  -- looking at in a report.
  add column if not exists service_charge_waived boolean not null default false;

alter table public.orders
  add column if not exists service_type text not null default 'takeaway';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_service_type_check') then
    alter table public.orders
      add constraint orders_service_type_check
      check (service_type in ('takeaway', 'table'));
  end if;
end $$;

-- Backfill: the column default already wrote 'takeaway' everywhere, so
-- this only promotes the orders that sat at a table. They keep rate and
-- amount 0 — no servicio was ever charged on them.
update public.orders set service_type = 'table'
  where table_id is not null and service_type <> 'table';

create index if not exists idx_orders_service_type on public.orders(service_type);


-- ============================================================
-- 2. _service_charge — the whole of the new arithmetic
--
-- Deliberately a NEW function rather than two more parameters on
-- _price_checkout. That function already returns pre_tip_total
-- (00030:240), which is precisely the base the servicio is taken on, so
-- the charge composes cleanly after the call. Threading it through
-- instead would mean dropping both the 9-arg implementation AND the
-- 7-arg delegate that 00028's two sync RPCs call, and re-testing
-- lib/pricing.ts's mirror of it, to buy exactly the same numbers.
--
-- The waive flag never reaches here either: waived, takeaway and
-- "servicio disabled for this shop" all collapse into p_rate = 0.
-- ============================================================

create or replace function public._service_charge(
  p_pre_tip_gross numeric,  -- _price_checkout's pre_tip_total
  p_rate numeric,           -- 0 when takeaway, disabled, or waived
  p_tax_rate numeric        -- orders.tax_rate, the snapshot
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_gross numeric(10,2);
  v_tax numeric(10,2);
  v_rate numeric := greatest(0, coalesce(p_rate, 0));
  v_tax_rate numeric := greatest(0, coalesce(p_tax_rate, 0));
begin
  if v_rate = 0 or coalesce(p_pre_tip_gross, 0) <= 0 then
    return jsonb_build_object('gross', 0::numeric(10,2), 'tax', 0::numeric(10,2), 'net', 0::numeric(10,2));
  end if;

  v_gross := round(p_pre_tip_gross * v_rate, 2);
  v_tax := round(v_gross - (v_gross / (1 + v_tax_rate)), 2);

  return jsonb_build_object('gross', v_gross, 'tax', v_tax, 'net', v_gross - v_tax);
end;
$$;

revoke execute on function public._service_charge(numeric, numeric, numeric)
  from public, anon, authenticated;


-- ============================================================
-- 3. create_order — gains p_service_type, snapshots the rate
--
-- DROPPED first, not replaced. `create or replace` with a third
-- defaulted parameter does not replace the 2-arg function, it creates a
-- third-arity sibling, and a 2-arg call then matches both:
-- "function create_order(jsonb, uuid) is not unique". This repo has
-- already been bitten by exactly that — 00013:31 exists to clear a
-- stale create_order(jsonb) left behind the same way.
--
-- Re-emitted from 00026:16-62 with only the service-type additions.
-- ============================================================

drop function if exists public.create_order(jsonb, uuid);

create or replace function public.create_order(
  items jsonb,
  p_table_id uuid default null,
  p_service_type text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_location_id uuid;
  v_user_id uuid;
  v_order_id uuid;
  v_order_number integer;
  v_tax_rate numeric(5,4);
  v_service_enabled boolean;
  v_service_rate numeric(5,4);
  v_service_type text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  v_location_id := public.get_current_location_id();
  if v_location_id is null then raise exception 'No location for user'; end if;

  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Order has no items';
  end if;

  if p_table_id is not null and not exists (
    select 1 from public.tables where id = p_table_id and location_id = v_location_id
  ) then
    raise exception 'Invalid table';
  end if;

  -- A table always means table service. Without one the caller decides,
  -- because a stool at the bar is table service with no table to name.
  v_service_type := case
    when p_table_id is not null then 'table'
    else coalesce(nullif(trim(coalesce(p_service_type, '')), ''), 'takeaway')
  end;
  if v_service_type not in ('takeaway', 'table') then
    raise exception 'Invalid service type: %', v_service_type;
  end if;

  select coalesce(tax_rate, 0.13),
         coalesce(table_service_enabled, false),
         coalesce(table_service_rate, 0)
    into v_tax_rate, v_service_enabled, v_service_rate
    from public.location_settings where location_id = v_location_id;
  v_tax_rate := coalesce(v_tax_rate, 0.13);
  v_service_enabled := coalesce(v_service_enabled, false);
  v_service_rate := coalesce(v_service_rate, 0);

  v_order_number := public.next_order_number(v_location_id);

  -- Rate is snapshotted now; the AMOUNT stays 0 until payment. See the
  -- parked-order invariant in this file's header.
  insert into public.orders (location_id, user_id, status, order_number, tax_rate,
                             total_amount, table_id, occurred_at,
                             service_type, service_charge_rate)
    values (v_location_id, v_user_id, 'draft', v_order_number, v_tax_rate,
            0, p_table_id, now(),
            v_service_type,
            case when v_service_type = 'table' and v_service_enabled then v_service_rate else 0 end)
    returning id into v_order_id;

  perform public._insert_priced_items(v_order_id, items, v_location_id, true, '[]'::jsonb);
  perform public._recompute_order_totals(v_order_id);

  update public.orders set status = 'parked' where id = v_order_id;
  return v_order_id;
end;
$function$;

revoke execute on function public.create_order(jsonb, uuid, text) from public, anon;
grant execute on function public.create_order(jsonb, uuid, text) to authenticated;


-- ============================================================
-- 4. _recompute_order_totals — defensive reset
--
-- It overwrites subtotal/tax_amount/total_amount wholesale from
-- order_items, which would obliterate a folded-in servicio. That is
-- safe today only because its one caller that can run after payment,
-- append_to_order, refuses anything not 'parked' — and a parked order
-- carries no servicio. Zero the servicio columns too, so a future
-- caller on a completed order clobbers it TOTALLY rather than leaving
-- a service_charge_amount stranded beside totals that no longer
-- contain it. Same signature, so a plain replace.
-- ============================================================

create or replace function public._recompute_order_totals(p_order_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.orders o set
    subtotal = coalesce((select sum(total_price - tax_amount) from public.order_items where order_id = p_order_id), 0),
    tax_amount = coalesce((select sum(tax_amount) from public.order_items where order_id = p_order_id), 0),
    total_amount = coalesce((select sum(total_price) from public.order_items where order_id = p_order_id), 0),
    service_charge_amount = 0,
    service_charge_tax = 0,
    service_charge_waived = false
  where o.id = p_order_id;
end;
$$;


-- ============================================================
-- 5. complete_order -- the servicio is charged here, and only here
--
-- DROPPED at its 12-arg signature and recreated at 14. PostgREST
-- cannot resolve ambiguous overloads (00018:74-79, 00030:274-277), so
-- the old one has to go before the new one arrives.
--
-- Re-emitted from 00030:286-472 with the servicio fold added after the
-- (unchanged) _price_checkout call, and placed BEFORE the cash check so
-- "amount tendered is less than the total due" compares against the
-- total the customer is actually being asked for.
-- ============================================================

drop function if exists public.complete_order(
  uuid, text, text, numeric, numeric, text, text, text, text, numeric, text, jsonb
);

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
  p_discount_reason text default null,
  -- [{"order_item_id": uuid, "quantity": int}] — null/absent means the
  -- discount is taken against the whole order, exactly as before.
  p_discount_items jsonb default null,
  -- Waive the servicio on this sale. No reason required -- it is a
  -- charge the shop chose to add, not money taken off the food.
  p_waive_service boolean default false,
  -- Correct the service type at the till ("ordered to go, then sat
  -- down"). null leaves orders.service_type as parked.
  p_service_type text default null
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
  v_scope jsonb;
  v_scope_items jsonb;
  v_base_gross numeric(10,2);
  v_base_tax numeric(10,2);
  v_math jsonb;
  v_discount numeric(10,2);
  v_total numeric(10,2);
  v_change numeric(10,2);
  v_service_type text;
  v_service_rate numeric(5,4);
  v_service_enabled boolean;
  v_service_gross numeric(10,2);
  v_service_tax numeric(10,2);
  v_waived boolean;
  v_svc jsonb;
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

  -- Resolve the targeted lines first: the base they add up to is what
  -- the discount is then taken on. Raises if a line is not part of this
  -- order, so a client cannot widen its own base.
  v_scope := public._resolve_discount_scope(p_order_id, p_discount_items, true, '[]'::jsonb);
  -- nullif against 'null'::jsonb, not a bare null check: with no scope the
  -- helper returns a JSON null here, and `jsonb 'null' is null` is false --
  -- which would store {"items": null} on every ordinary whole-order
  -- discount and make `discount_scope is not null` meaningless.
  v_scope_items := nullif(v_scope->'items', 'null'::jsonb);
  v_base_gross := (v_scope->>'base_gross')::numeric;
  v_base_tax   := (v_scope->>'base_tax')::numeric;

  -- Naming lines but keying nothing is a half-finished action, not a
  -- whole-order discount: refuse it rather than quietly widening the
  -- base to the entire tab.
  if v_scope_items is not null
     and (p_discount_type is null or coalesce(p_discount_value, 0) <= 0) then
    raise exception 'A discount value is required when specific items are selected';
  end if;

  -- _price_checkout raises on an invalid type/an over-100%/an
  -- over-base discount in strict mode; the "reason required" check
  -- below still runs after it, exactly as the original ordering did,
  -- and against the COMPUTED discount amount (not the raw input) —
  -- an input that rounds down to zero must not demand a reason.
  v_math := public._price_checkout(
    v_gross, v_tax,
    coalesce(v_base_gross, v_gross), coalesce(v_base_tax, v_tax),
    p_discount_type, p_discount_value, p_tip_amount, true, '[]'::jsonb
  );
  v_discount := (v_math->>'discount_amount')::numeric;
  v_subtotal := (v_math->>'subtotal')::numeric;
  v_tax      := (v_math->>'tax_amount')::numeric;
  v_total    := (v_math->>'total_amount')::numeric;

  if v_discount > 0 and v_reason is null then
    raise exception 'A reason is required to apply a discount';
  end if;

  -- A reason with no discount is just a stray note; drop it so the audit
  -- and the receipt do not claim a discount that was never given. The
  -- scope goes with it for the same reason.
  if v_discount = 0 then
    v_reason := null;
    v_scope_items := null;
  end if;

  -- -- Servicio --------------------------------------------------
  -- Taken on pre_tip_total -- the post-discount gross, tip excluded --
  -- so a comped coffee reduces it and a tip never compounds on top of
  -- it. Waived, takeaway, and "disabled for this shop" all arrive at
  -- _service_charge as rate 0.
  v_service_type := coalesce(
    nullif(trim(coalesce(p_service_type, '')), ''), v_order.service_type, 'takeaway');
  if v_service_type not in ('takeaway', 'table') then
    raise exception 'Invalid service type: %', v_service_type;
  end if;

  -- Waiving a takeaway order is a no-op, not a fact worth recording.
  v_waived := coalesce(p_waive_service, false) and v_service_type = 'table';

  if v_service_type is distinct from v_order.service_type then
    -- The type changed at the till, so the rate snapshotted at park
    -- time is for the wrong service. Re-snapshot from live settings.
    select coalesce(table_service_enabled, false), coalesce(table_service_rate, 0)
      into v_service_enabled, v_service_rate
      from public.location_settings where location_id = v_location_id;
    v_service_rate := case
      when v_service_type = 'table' and coalesce(v_service_enabled, false)
        then coalesce(v_service_rate, 0)
      else 0 end;
  else
    v_service_rate := case
      when v_service_type = 'table' then coalesce(v_order.service_charge_rate, 0)
      else 0 end;
  end if;
  if v_waived then v_service_rate := 0; end if;

  v_svc := public._service_charge(
    (v_math->>'pre_tip_total')::numeric, v_service_rate, coalesce(v_order.tax_rate, 0.13));
  v_service_gross := (v_svc->>'gross')::numeric;
  v_service_tax   := (v_svc->>'tax')::numeric;

  -- Folded into subtotal/tax rather than added as a fourth term, so
  -- total = subtotal + tax + tip still holds (00018:29-31).
  v_subtotal := v_subtotal + (v_svc->>'net')::numeric;
  v_tax      := v_tax + v_service_tax;
  v_total    := v_subtotal + v_tax + (v_math->>'tip_amount')::numeric;

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
        discount_scope = case
          when v_scope_items is null then null
          else jsonb_build_object(
                 'items', v_scope_items,
                 'base_gross', v_base_gross,
                 'base_tax', v_base_tax)
        end,
        service_type = v_service_type,
        service_charge_rate = v_service_rate,
        service_charge_amount = v_service_gross,
        service_charge_tax = v_service_tax,
        service_charge_waived = v_waived,
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
          -- A comp aimed at particular drinks is exactly the shrinkage
          -- pattern 00018's audit trail exists to catch, so record what
          -- was aimed at, not just how much came off.
          'discount_scope', v_scope_items,
          'discount_base_gross', v_base_gross,
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
  uuid, text, text, numeric, numeric, text, text, text, text, numeric, text, jsonb, boolean, text
) from public, anon;
grant execute on function public.complete_order(
  uuid, text, text, numeric, numeric, text, text, text, text, numeric, text, jsonb, boolean, text
) to authenticated;


-- ============================================================
-- 6. Offline sync -- an offline table order must not be undercharged
--
-- sync_offline_order gains an 11th argument (drop + recreate, and the
-- grants re-issued at the new signature, since the old ACL dies with
-- the old function). sync_offline_payment keeps its signature and takes
-- the waive flag and the corrected type out of the p_payment jsonb it
-- already carries.
--
-- Re-emitted from 00028:26-328 and 00028:339-529.
-- ============================================================

drop function if exists public.sync_offline_order(
  uuid, jsonb, text, text, uuid, numeric, uuid, jsonb, jsonb, uuid
);

create or replace function public.sync_offline_order(
  p_client_uuid uuid,
  p_items jsonb,
  p_offline_ref text default null,
  p_device_id text default null,
  p_table_id uuid default null,
  p_client_age_seconds numeric default 0,
  p_expected_shift_id uuid default null,
  p_payment jsonb default null,
  p_client_charge jsonb default null,
  p_location_id uuid default null,
  -- 'takeaway' | 'table'. Needed as its own argument because the
  -- Floor can park a TABLE order with no table assigned (bar
  -- seating), which p_table_id alone cannot express.
  p_service_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  v_service_type text;
  v_service_rate numeric(5,4);
  v_service_enabled boolean;
  v_service_gross numeric(10,2);
  v_service_tax numeric(10,2);
  v_waived boolean;
  v_svc jsonb;
  v_gross_eff numeric(10,2);
  v_tax_eff numeric(10,2);
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

  -- Phase 4: reject a queued sale stamped for a location other than the
  -- one the caller is CURRENTLY at. P0001 is classified "permanent" by
  -- lib/offline/sync.ts's classifyError, so this lands the entry in
  -- `failed` — visible and manually retryable once the device switches
  -- back — rather than burning the attempt budget or silently landing
  -- the sale in the wrong shop's books.
  if p_location_id is not null and p_location_id <> v_location_id then
    raise exception 'This queued sale belongs to another location. Switch back to it to send.'
      using errcode = 'P0001';
  end if;

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

  select coalesce(tax_rate, 0.13),
         coalesce(table_service_enabled, false),
         coalesce(table_service_rate, 0)
    into v_tax_rate, v_service_enabled, v_service_rate
    from public.location_settings where location_id = v_location_id;
  v_tax_rate := coalesce(v_tax_rate, 0.13);

  -- A table always implies table service; without one the queued entry
  -- says which it was, and a pre-servicio client that sends nothing
  -- falls back to the old table_id inference.
  v_service_type := coalesce(
    nullif(trim(coalesce(p_service_type, '')), ''),
    case when v_table_id is not null then 'table' else 'takeaway' end);
  if v_service_type not in ('takeaway', 'table') then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'invalid_service_type', 'value', p_service_type);
    v_service_type := case when v_table_id is not null then 'table' else 'takeaway' end;
  end if;
  v_service_rate := case
    when v_service_type = 'table' and coalesce(v_service_enabled, false)
      then coalesce(v_service_rate, 0)
    else 0 end;

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
      table_id, client_uuid, device_id, offline_ref, occurred_at, created_at,
      service_type, service_charge_rate
    )
    values (
      v_location_id, auth.uid(), 'draft',
      public.next_order_number(v_location_id, v_occurred),
      v_tax_rate, 0,
      v_table_id, p_client_uuid, p_device_id, p_offline_ref, v_occurred, v_occurred,
      v_service_type, v_service_rate
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

  -- -- Servicio ---------------------------------------------------
  -- Same arithmetic as complete_order, taken on the post-discount
  -- gross. Lenient like everything else in this function: the sale
  -- already happened, so a rate we cannot resolve becomes 0, never an
  -- exception.
  v_waived := coalesce((p_payment->>'waive_service')::boolean, false)
              and v_service_type = 'table';
  if v_waived then v_service_rate := 0; end if;

  v_svc := public._service_charge(
    (v_math->>'pre_tip_total')::numeric, v_service_rate, v_tax_rate);
  v_service_gross := (v_svc->>'gross')::numeric;
  v_service_tax   := (v_svc->>'tax')::numeric;

  v_server_total := (v_math->>'total_amount')::numeric + v_service_gross;

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
  -- The basis the charged gross is prorated against has to be the one
  -- the customer was actually quoted: post-discount AND servicio-
  -- inclusive. The old expression used v_gross/v_tax -- the PRE-discount
  -- list figures, with no servicio in them -- so with a servicio the
  -- ratio exceeded 1 and the recorded IVA corresponded to no real tax
  -- base at all. (It was already off on a discounted offline sale.)
  v_gross_eff := (v_math->>'pre_tip_total')::numeric + v_service_gross;
  v_tax_eff   := (v_math->>'tax_amount')::numeric + v_service_tax;

  if abs(v_server_total - v_client_total) >= 0.01 then
    v_charged_gross  := v_client_total - (v_math->>'tip_amount')::numeric;
    v_tax_final      := case when v_gross_eff > 0
                          then round(v_tax_eff * v_charged_gross / v_gross_eff, 2) else 0 end;
    v_subtotal_final := v_charged_gross - v_tax_final;
    v_total_final    := v_client_total;
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'total_mismatch', 'server', v_server_total, 'client', v_client_total);
  else
    -- Folded, as in complete_order.
    v_subtotal_final := (v_math->>'subtotal')::numeric + (v_svc->>'net')::numeric;
    v_tax_final      := v_tax_eff;
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
        service_type = v_service_type,
        service_charge_rate = v_service_rate,
        service_charge_amount = v_service_gross,
        service_charge_tax = v_service_tax,
        service_charge_waived = v_waived,
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
$function$;

revoke execute on function public.sync_offline_order(
  uuid, jsonb, text, text, uuid, numeric, uuid, jsonb, jsonb, uuid, text
) from public, anon;
grant execute on function public.sync_offline_order(
  uuid, jsonb, text, text, uuid, numeric, uuid, jsonb, jsonb, uuid, text
) to authenticated, service_role;

create or replace function public.sync_offline_payment(
  p_order_id uuid,
  p_client_uuid uuid,
  p_client_age_seconds numeric default 0,
  p_expected_shift_id uuid default null,
  p_payment jsonb default null,
  p_client_charge jsonb default null,
  p_location_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  v_tax_rate numeric(5,4);
  v_service_type text;
  v_service_rate numeric(5,4);
  v_service_enabled boolean;
  v_service_gross numeric(10,2);
  v_service_tax numeric(10,2);
  v_waived boolean;
  v_svc jsonb;
  v_gross_eff numeric(10,2);
  v_tax_eff numeric(10,2);
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

  -- Phase 4: same guard as sync_offline_order — see its header comment.
  if p_location_id is not null and p_location_id <> v_location_id then
    raise exception 'This queued sale belongs to another location. Switch back to it to send.'
      using errcode = 'P0001';
  end if;

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
  v_tax_rate := coalesce(v_order.tax_rate, 0.13);

  -- This order was parked on the server, so its own snapshot is the
  -- truth. Live settings are consulted only for an order parked before
  -- service_charge_rate existed, or when the till corrected the type.
  v_service_type := coalesce(
    nullif(trim(coalesce(p_payment->>'service_type', '')), ''),
    v_order.service_type,
    case when v_order.table_id is not null then 'table' else 'takeaway' end);
  if v_service_type not in ('takeaway', 'table') then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'invalid_service_type', 'value', p_payment->>'service_type');
    v_service_type := coalesce(v_order.service_type, 'takeaway');
  end if;

  if v_service_type is distinct from v_order.service_type
     or v_order.service_charge_rate is null then
    select coalesce(table_service_enabled, false), coalesce(table_service_rate, 0)
      into v_service_enabled, v_service_rate
      from public.location_settings where location_id = v_location_id;
    v_service_rate := case
      when v_service_type = 'table' and coalesce(v_service_enabled, false)
        then coalesce(v_service_rate, 0)
      else 0 end;
  else
    v_service_rate := case
      when v_service_type = 'table' then coalesce(v_order.service_charge_rate, 0)
      else 0 end;
  end if;

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

  -- -- Servicio ---------------------------------------------------
  -- Same arithmetic as complete_order, taken on the post-discount
  -- gross. Lenient like everything else in this function: the sale
  -- already happened, so a rate we cannot resolve becomes 0, never an
  -- exception.
  v_waived := coalesce((p_payment->>'waive_service')::boolean, false)
              and v_service_type = 'table';
  if v_waived then v_service_rate := 0; end if;

  v_svc := public._service_charge(
    (v_math->>'pre_tip_total')::numeric, v_service_rate, v_tax_rate);
  v_service_gross := (v_svc->>'gross')::numeric;
  v_service_tax   := (v_svc->>'tax')::numeric;

  v_server_total := (v_math->>'total_amount')::numeric + v_service_gross;
  v_client_total := coalesce((p_client_charge->>'totalAmount')::numeric, v_server_total);

  if p_payment->>'payment_method' = 'cash' then
    if (p_payment->>'amount_tendered') is null
       or (p_payment->>'amount_tendered')::numeric < v_client_total then
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'tendered_short', 'tendered', p_payment->>'amount_tendered', 'total', v_client_total);
    end if;
  end if;

  -- The basis the charged gross is prorated against has to be the one
  -- the customer was actually quoted: post-discount AND servicio-
  -- inclusive. The old expression used v_gross/v_tax -- the PRE-discount
  -- list figures, with no servicio in them -- so with a servicio the
  -- ratio exceeded 1 and the recorded IVA corresponded to no real tax
  -- base at all. (It was already off on a discounted offline sale.)
  v_gross_eff := (v_math->>'pre_tip_total')::numeric + v_service_gross;
  v_tax_eff   := (v_math->>'tax_amount')::numeric + v_service_tax;

  if abs(v_server_total - v_client_total) >= 0.01 then
    v_charged_gross  := v_client_total - (v_math->>'tip_amount')::numeric;
    v_tax_final      := case when v_gross_eff > 0
                          then round(v_tax_eff * v_charged_gross / v_gross_eff, 2) else 0 end;
    v_subtotal_final := v_charged_gross - v_tax_final;
    v_total_final    := v_client_total;
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'total_mismatch', 'server', v_server_total, 'client', v_client_total);
  else
    -- Folded, as in complete_order.
    v_subtotal_final := (v_math->>'subtotal')::numeric + (v_svc->>'net')::numeric;
    v_tax_final      := v_tax_eff;
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
        service_type = v_service_type,
        service_charge_rate = v_service_rate,
        service_charge_amount = v_service_gross,
        service_charge_tax = v_service_tax,
        service_charge_waived = v_waived,
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
$function$;


-- ============================================================
-- 7. shift_summary -- the servicio on its own line
--
-- It already sums subtotal/tax_amount/total_amount per order, so the
-- folded servicio flows into net_sales and tax_amount correctly. Same
-- signature, so a plain replace. recent_shifts sums only total_amount
-- and needs nothing.
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

  with scoped as (
    select o.*,
           -- Rung up in this shift and not handed back during it.
           (o.shift_id = v_shift.id
            and (o.status = 'completed'
                 or (o.status = 'refunded' and o.refund_shift_id is distinct from v_shift.id))
           ) as sold_here,
           -- Paid back out of this shift's drawer.
           (o.status = 'refunded' and o.refund_shift_id = v_shift.id) as refunded_here
    from public.orders o
    where o.shift_id = v_shift.id or o.refund_shift_id = v_shift.id
  )
  select
    coalesce(sum(total_amount) filter (where sold_here and payment_method = 'cash'), 0),
    coalesce(sum(total_amount) filter (where refunded_here and payment_method = 'cash'), 0),
    jsonb_build_object(
      'order_count',   count(*) filter (where sold_here),
      'refund_count',  count(*) filter (where refunded_here),
      'void_count',    count(*) filter (where shift_id = v_shift.id and status = 'cancelled'),
      'gross_sales',   coalesce(sum(total_amount)    filter (where sold_here), 0),
      'net_sales',     coalesce(sum(subtotal)        filter (where sold_here), 0),
      'tax_amount',    coalesce(sum(tax_amount)      filter (where sold_here), 0),
      'tip_amount',    coalesce(sum(tip_amount)      filter (where sold_here), 0),
      -- The servicio is inside net_sales/tax_amount above (it is taxable
      -- revenue, not a tip), but the shop still needs to see it on its
      -- own line -- it is usually owed onward to staff.
      'service_charge', coalesce(sum(service_charge_amount) filter (where sold_here), 0),
      'discount_amount', coalesce(sum(discount_amount) filter (where sold_here), 0),
      'refund_total',  coalesce(sum(total_amount)    filter (where refunded_here), 0),
      'by_payment_method', coalesce((
        select jsonb_object_agg(pm, amt) from (
          select payment_method as pm, sum(total_amount) as amt
          from scoped
          where sold_here and payment_method is not null
          group by payment_method
        ) s
      ), '{}'::jsonb)
    )
  into v_cash_sales, v_cash_refunds, v_sales
  from scoped;

  select
    coalesce(sum(amount) filter (where type = 'paid_in'), 0),
    coalesce(sum(amount) filter (where type = 'paid_out'), 0)
  into v_paid_in, v_paid_out
  from public.cash_movements where shift_id = v_shift.id;

  v_expected := v_shift.opening_float + v_cash_sales - v_cash_refunds + v_paid_in - v_paid_out;

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



-- ============================================================
-- 8. sales_summary -- undo the fold before apportioning the discount
--
-- See the comment added inside the `sold` CTE. Note the basis change
-- this migration makes, alongside 00033's own basis note: net_sales,
-- tax_amount, average_ticket_net and by_staff.net now INCLUDE the
-- servicio. That is correct -- it is taxable revenue, not a tip -- but
-- it means a shop that switches the servicio on will see those lines
-- step up, and 'service_charge' is the line that explains it.
-- ============================================================

create or replace function public.sales_summary(
  p_start date,
  p_end date
)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_span integer;
  v_prev_start timestamptz;
  v_prev_end timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_admin() then
    raise exception 'Only an admin can read sales reports';
  end if;

  v_location_id := public.get_current_location_id();

  select coalesce(timezone, 'America/Costa_Rica') into v_tz
    from public.location_settings where location_id = v_location_id;
  v_tz := coalesce(v_tz, 'America/Costa_Rica');

  -- Local midnight on p_start through the instant before local midnight
  -- after p_end, converted to absolute time for the index-friendly scan.
  v_start := (p_start::timestamp) at time zone v_tz;
  v_end   := ((p_end + 1)::timestamp) at time zone v_tz;

  -- The immediately preceding window of equal length, for deltas.
  v_span       := (p_end - p_start) + 1;
  v_prev_start := ((p_start - v_span)::timestamp) at time zone v_tz;
  v_prev_end   := v_start;

  with scoped as (
    select o.*,
           (o.created_at at time zone v_tz)::date         as local_day,
           extract(hour   from (o.created_at at time zone v_tz))::int as local_hour,
           extract(isodow from (o.created_at at time zone v_tz))::int as local_dow
    from public.orders o
    where o.location_id = v_location_id
      and o.created_at >= v_start
      and o.created_at <  v_end
  ),

  -- A sale belongs to the period it was RUNG UP in, whether or not a
  -- later period handed the money back. That is what makes a closed
  -- period's report reproducible.
  sale as (
    select * from scoped where status in ('completed', 'refunded')
  ),

  -- A refund belongs to the period the money left the till.
  refunded as (
    select o.*
    from public.orders o
    where o.location_id = v_location_id
      and o.refunded_at >= v_start
      and o.refunded_at <  v_end
  ),

  -- ── Line-level revenue on the net basis ──────────────────
  -- discount_scope names the exact lines and units an item-scoped
  -- discount was taken against (00030:426-432); a null scope means the
  -- whole order was the base.
  scope_items as (
    select s.id as order_id,
           (elem->>'order_item_id')::uuid as order_item_id,
           (elem->>'quantity')::int       as scope_qty
    from sale s
    cross join lateral jsonb_array_elements(coalesce(s.discount_scope->'items', '[]'::jsonb)) elem
  ),

  lines as (
    select s.id as order_id,
           s.local_day,
           oi.id           as order_item_id,
           oi.menu_item_id,
           oi.quantity,
           oi.total_price,
           oi.tax_amount,
           (oi.total_price - oi.tax_amount) as line_net_list,
           -- How much of this line the discount was taken against.
           case
             when s.discount_scope is null then (oi.total_price - oi.tax_amount)
             else (oi.total_price - oi.tax_amount)
                  * coalesce(si.scope_qty, 0)::numeric / nullif(oi.quantity, 0)
           end as base_net,
           mi.name        as item_name,
           mi.category_id
    from sale s
    join public.order_items oi on oi.order_id = s.id
    left join public.menu_items mi on mi.id = oi.menu_item_id
    left join scope_items si on si.order_id = s.id and si.order_item_id = oi.id
  ),

  order_base as (
    select order_id,
           sum(base_net)      as base_net_total,
           sum(line_net_list) as list_net_total
    from lines group by order_id
  ),

  -- (list_net_total - subtotal) is the order's whole ex-IVA discount:
  -- subtotal is already discount-net (00030:225-230) while the lines
  -- keep their list prices. Since 00034, subtotal ALSO carries the
  -- servicio's ex-IVA part, so that has to come back out first --
  -- otherwise the delta can go NEGATIVE and the apportionment below
  -- attributes service-charge revenue to coffee and sandwiches (or,
  -- with a discount_scope, loads a whole order's servicio onto one
  -- comped line and pushes its line_net above its own list price). Splitting it across the base lines in
  -- proportion to base_net makes sum(line_net) = sum(orders.subtotal)
  -- by construction -- which is exactly the reconciliation the old
  -- report could not do.
  sold as (
    select l.order_id, l.local_day, l.menu_item_id, l.quantity,
           l.item_name, l.category_id, l.order_item_id,
           l.line_net_list as line_gross,
           l.line_net_list
             - case
                 when ob.base_net_total > 0
                 then (ob.list_net_total
                       - (s.subtotal - coalesce(s.service_charge_amount - s.service_charge_tax, 0)))
                      * l.base_net / ob.base_net_total
                 else 0
               end as line_net
    from lines l
    join order_base ob on ob.order_id = l.order_id
    join sale s        on s.id        = l.order_id
  ),

  -- Days the shop actually rang something up. Averaging "orders per
  -- hour" over calendar days would punish a shop for being closed on
  -- Mondays.
  operating as (
    select count(distinct local_day)::numeric as days from sale
  ),

  -- ── Previous window, for the delta chips ─────────────────
  prev as (
    select o.* from public.orders o
    where o.location_id = v_location_id
      and o.created_at >= v_prev_start
      and o.created_at <  v_prev_end
      and o.status in ('completed', 'refunded')
  ),
  prev_items as (
    select coalesce(sum(oi.quantity), 0) as qty
    from prev p join public.order_items oi on oi.order_id = p.id
  )

  select jsonb_build_object(
    -- ── Headline figures ──────────────────────────────────────
    'order_count',  (select count(*) from sale),
    'refund_count', (select count(*) from refunded),
    'void_count',   (select count(*) from scoped where status = 'cancelled'),

    -- gross = what customers actually paid (includes IVA and tips)
    'gross_sales',  (select coalesce(sum(total_amount), 0) from sale),
    -- net = ex-IVA, discount-net sales; the real revenue line
    'net_sales',    (select coalesce(sum(subtotal), 0) from sale),
    -- ...and the same net after subtracting what was handed back
    'net_sales_after_refunds',
      (select coalesce(sum(subtotal), 0) from sale)
      - (select coalesce(sum(subtotal), 0) from refunded),
    'tax_amount',   (select coalesce(sum(tax_amount), 0) from sale),
    -- tips are staff liability, reported separately and never in revenue
    'tip_amount',   (select coalesce(sum(tip_amount), 0) from sale),
    -- The servicio, unlike a tip, IS taxable revenue: it sits inside
    -- net_sales, tax_amount and average_ticket_net above. Reported here
    -- on its own line because the shop still owes it onward.
    'service_charge', (select coalesce(sum(service_charge_amount), 0) from sale),
    'discount_amount', (select coalesce(sum(discount_amount), 0) from sale),
    'refund_total', (select coalesce(sum(total_amount), 0) from refunded),

    'items_sold',   (select coalesce(sum(quantity), 0) from sold),
    -- Kept tip-inclusive for every existing caller; average_ticket_net
    -- is the like-for-like companion to net_sales.
    'average_ticket', (
      select case when count(*) > 0 then round(sum(total_amount) / count(*), 2) else 0 end
      from sale
    ),
    'average_ticket_net', (
      select case when count(*) > 0 then round(sum(subtotal + tax_amount) / count(*), 2) else 0 end
      from sale
    ),
    'operating_days', (select days from operating),

    'basket', jsonb_build_object(
      'avg_items_per_order', (
        select case when (select count(*) from sale) > 0
               then round(coalesce(sum(quantity), 0)::numeric / (select count(*) from sale), 2)
               else 0 end from sold),
      'avg_lines_per_order', (
        select case when (select count(*) from sale) > 0
               then round(count(*)::numeric / (select count(*) from sale), 2)
               else 0 end from sold)
    ),

    'previous_period', jsonb_build_object(
      'order_count', (select count(*) from prev),
      'net_sales',   (select coalesce(sum(subtotal), 0) from prev),
      'gross_sales', (select coalesce(sum(total_amount), 0) from prev),
      'items_sold',  (select qty from prev_items),
      'average_ticket_net', (
        select case when count(*) > 0 then round(sum(subtotal + tax_amount) / count(*), 2) else 0 end
        from prev
      ),
      -- Gap-filled and the same length as by_day, so the chart can pair
      -- them off by index: element i is the day i days into the previous
      -- window, which is the like-for-like comparison point.
      'by_day', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'date', to_char(d.day, 'YYYY-MM-DD'),
                 'net',  coalesce(x.net, 0))
               order by d.day)
        from generate_series((p_start - v_span)::timestamp,
                             (p_start - 1)::timestamp, interval '1 day') d(day)
        left join (
          select (created_at at time zone v_tz)::date as local_day,
                 sum(subtotal) as net
          from prev group by 1
        ) x on x.local_day = d.day::date
      ), '[]'::jsonb)
    ),

    -- ── Payment mix (the number reconciliation needs) ─────────
    'by_payment_method', coalesce((
      select jsonb_agg(jsonb_build_object('method', method, 'total', total, 'count', cnt)
                       order by total desc)
      from (
        select payment_method as method, sum(total_amount) as total, count(*) as cnt
        from sale
        where payment_method is not null
        group by payment_method
      ) t
    ), '[]'::jsonb),

    -- ── Trends, bucketed on the LOCAL business day, gap-filled ─
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date',   to_char(d.day, 'YYYY-MM-DD'),
               'gross',  coalesce(x.gross, 0),
               'net',    coalesce(x.net, 0),
               'orders', coalesce(x.orders, 0))
             order by d.day)
      from generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') d(day)
      left join (
        select local_day,
               sum(total_amount) as gross,
               sum(subtotal)     as net,
               count(*)          as orders
        from sale group by local_day
      ) x on x.local_day = d.day::date
    ), '[]'::jsonb),

    'by_hour', coalesce((
      select jsonb_agg(jsonb_build_object(
               'hour',       h.hh,
               'orders',     coalesce(x.orders, 0),
               'gross',      coalesce(x.gross, 0),
               'net',        coalesce(x.net, 0),
               -- Per operating day, so the shape means the same thing
               -- over a one-day range and a thirty-day one.
               'avg_orders', round(coalesce(x.orders, 0) / greatest((select days from operating), 1), 2),
               'avg_net',    round(coalesce(x.net, 0)    / greatest((select days from operating), 1), 2))
             order by h.hh)
      from generate_series(0, 23) h(hh)
      left join (
        select local_hour as hh, count(*) as orders,
               sum(total_amount) as gross, sum(subtotal) as net
        from sale group by local_hour
      ) x on x.hh = h.hh
    ), '[]'::jsonb),

    'by_weekday', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dow',     w.dw,
               'orders',  coalesce(x.orders, 0),
               'net',     coalesce(x.net, 0),
               'days',    coalesce(x.days, 0),
               'avg_net', round(coalesce(x.net, 0) / greatest(coalesce(x.days, 0), 1), 2))
             order by w.dw)
      from generate_series(1, 7) w(dw)
      left join (
        select local_dow as dw, count(*) as orders, sum(subtotal) as net,
               count(distinct local_day) as days
        from sale group by local_dow
      ) x on x.dw = w.dw
    ), '[]'::jsonb),

    -- ── Breakdowns, all on the net basis ──────────────────────
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', name, 'quantity', qty,
               'revenue', round(rev, 2), 'gross_revenue', round(gross, 2))
             order by rev desc)
      from (
        select coalesce(c.name, 'Uncategorized') as name,
               sum(sold.quantity)   as qty,
               sum(sold.line_net)   as rev,
               sum(sold.line_gross) as gross
        from sold
        left join public.categories c on c.id = sold.category_id
        group by coalesce(c.name, 'Uncategorized')
      ) cat
    ), '[]'::jsonb),

    'by_staff', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', name, 'orders', orders, 'net', net, 'tips', tips,
               -- kept so nothing reading `gross` breaks
               'gross', gross)
             order by net desc)
      from (
        select coalesce(nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), ''),
                        'Unknown') as name,
               count(*)                  as orders,
               sum(s.subtotal)           as net,
               sum(s.tip_amount)         as tips,
               sum(s.total_amount)       as gross
        from sale s
        left join public.user_profiles up on up.id = s.user_id
        group by 1
      ) st
    ), '[]'::jsonb),

    'top_items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', name, 'quantity', qty,
               'revenue', round(rev, 2), 'gross_revenue', round(gross, 2))
             order by qty desc)
      from (
        select coalesce(item_name, 'Unknown Item') as name,
               sum(quantity)   as qty,
               sum(line_net)   as rev,
               sum(line_gross) as gross
        from sold
        group by coalesce(item_name, 'Unknown Item')
        order by sum(quantity) desc
        limit 50
      ) ti
    ), '[]'::jsonb),

    -- Attach counts only. extra_price is already folded into
    -- order_items.unit_price (00005:238), so summing it here would
    -- double-count the revenue it contributed.
    'by_modifier', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'quantity', qty) order by qty desc)
      from (
        select oim.name, sum(sold.quantity) as qty
        from sold
        join public.order_item_modifiers oim on oim.order_item_id = sold.order_item_id
        group by oim.name
        order by sum(sold.quantity) desc
        limit 15
      ) m
    ), '[]'::jsonb),

    'by_discount_reason', coalesce((
      select jsonb_agg(jsonb_build_object('reason', reason, 'count', cnt, 'total', total)
                       order by total desc)
      from (
        select coalesce(nullif(trim(discount_reason), ''), 'Unspecified') as reason,
               count(*) as cnt, sum(discount_amount) as total
        from sale where discount_amount > 0
        group by 1
      ) d
    ), '[]'::jsonb),

    'by_refund_reason', coalesce((
      select jsonb_agg(jsonb_build_object('reason', reason, 'count', cnt, 'total', total)
                       order by total desc)
      from (
        select coalesce(nullif(trim(oa.reason), ''), 'Unspecified') as reason,
               count(*) as cnt, sum(r.total_amount) as total
        from refunded r
        left join lateral (
          select reason from public.order_audit
           where order_id = r.id and action = 'refund'
           order by created_at desc limit 1
        ) oa on true
        group by 1
      ) d
    ), '[]'::jsonb),

    -- Dead menu weight: on the menu, orderable, and nobody bought one.
    'never_sold', coalesce((
      select jsonb_agg(jsonb_build_object('name', mi.name, 'price', mi.price)
                       order by mi.name)
      from public.menu_items mi
      where mi.location_id = v_location_id
        and mi.is_active = true
        and mi.archived_at is null
        and not exists (select 1 from sold where sold.menu_item_id = mi.id)
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;



-- ============================================================
-- 9. orders_for_export -- three columns, appended
--
-- DROPPED first: it has a `returns table (...)` clause, and
-- `create or replace` cannot change a return type. 00018:260 does the
-- same drop for the same reason.
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
  customer_email text,
  service_type text,
  service_charge_rate numeric,
  service_charge_amount numeric
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
  if not public.is_admin() then
    raise exception 'Only an admin can export financial reports';
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
    o.customer_email,
    o.service_type,
    o.service_charge_rate,
    o.service_charge_amount
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


-- ============================================================
-- 10. create_location -- copy the servicio config to a new location
--
-- Its settings INSERT enumerates the columns it clones, so without this
-- a new location silently gets the defaults instead of the source
-- shop's servicio configuration.
-- ============================================================

create or replace function public.create_location(
  p_name text, p_address text default null, p_copy_menu_from uuid default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_cat jsonb; v_mod jsonb; v_item jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.location_members
                  where user_id = auth.uid() and role = 'admin') then
    raise exception 'Only an admin can create a location';
  end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Name is required'; end if;
  if p_copy_menu_from is not null and not public.is_admin_at(p_copy_menu_from) then
    raise exception 'You can only copy a menu from a location you administer';
  end if;

  insert into public.locations (name, address, created_by)
    values (trim(p_name), nullif(trim(coalesce(p_address,'')),''), auth.uid())
    returning id into v_id;
  insert into public.location_members (user_id, location_id, role)
    values (auth.uid(), v_id, 'admin');

  insert into public.location_settings (location_id, currency, tax_rate,
                                        prices_include_tax, tip_enabled, timezone,
                                        table_service_enabled, table_service_rate)
  select v_id,
         coalesce(s.currency,'CRC'), coalesce(s.tax_rate,0.13),
         coalesce(s.prices_include_tax,true), coalesce(s.tip_enabled,false),
         coalesce(s.timezone,'America/Costa_Rica'),
         coalesce(s.table_service_enabled,false), coalesce(s.table_service_rate,0.10)
    from (select 1) x
    left join public.location_settings s on s.location_id = p_copy_menu_from
  on conflict (location_id) do nothing;

  if p_copy_menu_from is null then return v_id; end if;

  with m as (select c.id old_id, gen_random_uuid() new_id, c.name, c.sort_order
               from public.categories c where c.location_id = p_copy_menu_from),
       i as (insert into public.categories (id, location_id, name, sort_order)
             select new_id, v_id, name, sort_order from m)
  select coalesce(jsonb_object_agg(old_id::text, new_id),'{}') into v_cat from m;

  with m as (select x.id old_id, gen_random_uuid() new_id, x.name, x.is_multiple, x.is_required
               from public.modifiers x where x.location_id = p_copy_menu_from),
       i as (insert into public.modifiers (id, location_id, name, is_multiple, is_required)
             select new_id, v_id, name, is_multiple, is_required from m)
  select coalesce(jsonb_object_agg(old_id::text, new_id),'{}') into v_mod from m;

  insert into public.modifier_options (modifier_id, name, extra_price)
  select (v_mod->>o.modifier_id::text)::uuid, o.name, o.extra_price
    from public.modifier_options o
   where v_mod ? o.modifier_id::text;

  with m as (select x.id old_id, gen_random_uuid() new_id, x.category_id, x.name,
                    x.description, x.price, x.is_active, x.track_inventory,
                    x.low_stock_threshold
               from public.menu_items x where x.location_id = p_copy_menu_from),
       i as (insert into public.menu_items (id, location_id, category_id, name, description,
                 price, available_quantity, is_active, track_inventory,
                 low_stock_threshold, is_available)
             select new_id, v_id,
                    case when category_id is not null
                         then (v_cat->>category_id::text)::uuid end,
                    name, description, price,
                    0,          -- stock NEVER copies
                    is_active, track_inventory, low_stock_threshold, true
               from m)
  select coalesce(jsonb_object_agg(old_id::text, new_id),'{}') into v_item from m;

  insert into public.menu_item_modifiers (menu_item_id, modifier_id)
  select (v_item->>l.menu_item_id::text)::uuid, (v_mod->>l.modifier_id::text)::uuid
    from public.menu_item_modifiers l
   where v_item ? l.menu_item_id::text and v_mod ? l.modifier_id::text;

  return v_id;
end;
$$;


-- PostgREST caches the function signatures it exposes. Without this the
-- till keeps calling the create_order/complete_order/sync_offline_order
-- signatures this migration just dropped, and every sale fails until
-- the cache happens to refresh on its own.
notify pgrst, 'reload schema';
