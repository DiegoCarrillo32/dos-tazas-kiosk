-- ============================================================
-- Dos Tazas POS - Item-scoped discounts
-- Run AFTER 00029_fix_provision_staff_member_fk_order.sql
--
-- The loyalty club (a separate app, a separate database) hands members
-- rewards that are *specific drinks*: "Café del día gratis". Until now a
-- discount could only be taken against the whole order, so comping one
-- free coffee out of a ₡9.500 tab meant the cashier keying a colón
-- amount by hand and hoping it matched the drink's price. Anything they
-- mistyped went straight into the IVA re-split.
--
-- This adds a *scope* to the existing discount: the client may name the
-- order lines (and, within a line, how many units) the discount applies
-- to, and the server derives the base from those lines' own stored
-- prices. Everything else about 00018's design is unchanged:
--
--   * The client still never sends a finished discount amount -- it
--     sends type + raw value + which lines, and the server computes.
--   * A reason is still mandatory whenever money comes off.
--   * Order lines still keep their list prices (00018:33-37). The scope
--     is recorded on the order as `discount_scope`, not apportioned into
--     order_items, so per-item revenue in the category and top-item
--     reports keeps meaning the same thing it did yesterday.
--   * The stored invariant is still
--         total_amount = subtotal + tax_amount + tip_amount.
--
-- IVA. Only the IVA sitting inside the discounted lines can come off --
-- comping a coffee must not reduce the tax owed on the sandwich next to
-- it. The re-split below is therefore base-relative, and reduces to
-- 00018's proportional formula exactly when the base is the whole order,
-- so no existing behaviour or stored total shifts by a colón.
--
-- Offline is deliberately untouched. sync_offline_order /
-- sync_offline_payment (00028) keep calling the 7-argument
-- _price_checkout and know nothing about scopes: an order created
-- offline has no order_item ids to point at yet, and the counter hides
-- the item picker while the connection is down. Order-level discounts
-- work offline exactly as before.
-- ============================================================


-- ============================================================
-- 1. Where the scope is recorded
--
-- null  = the discount was taken against the whole order (every row
--         written before today, and every untargeted discount after).
-- else  = {"items":[{"order_item_id":uuid,"quantity":int}, ...],
--          "base_gross":numeric, "base_tax":numeric}
--
-- The base figures are snapshotted rather than recomputed on read: a
-- reprinted receipt from six months ago should show the arithmetic that
-- actually happened, not today's re-derivation of it.
-- ============================================================

alter table public.orders
  add column if not exists discount_scope jsonb;


-- ============================================================
-- 2. _resolve_discount_scope — which lines, and what are they worth
--
-- Internal only, like _price_checkout. Returns
--   {base_gross, base_tax, items, warnings}
-- with base_gross/base_tax null when there is no scope, so callers fall
-- straight through to whole-order behaviour.
--
-- The join is filtered by order_id, so a caller cannot borrow a cheap
-- line from another order -- or a line from an order belonging to
-- another location -- to widen its own discount base.
-- ============================================================

create or replace function public._resolve_discount_scope(
  p_order_id uuid,
  p_scope jsonb,
  p_strict boolean default true,
  p_warnings jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_warnings jsonb := coalesce(p_warnings, '[]'::jsonb);
  v_count integer;
  v_distinct integer;
  v_matched integer;
  v_base_gross numeric(10,2);
  v_base_tax numeric(10,2);
  v_items jsonb;
begin
  if p_scope is null
     or jsonb_typeof(p_scope) <> 'array'
     or jsonb_array_length(p_scope) = 0 then
    return jsonb_build_object(
      'base_gross', null, 'base_tax', null,
      'items', null, 'warnings', v_warnings);
  end if;

  -- Two entries for the same line would count that line's price twice.
  select count(*), count(distinct elem->>'order_item_id')
    into v_count, v_distinct
    from jsonb_array_elements(p_scope) elem;
  if v_count <> v_distinct then
    raise exception 'Duplicate item in the discount selection';
  end if;

  with sel as (
    select
      (elem->>'order_item_id')::uuid as order_item_id,
      (elem->>'quantity')::int       as quantity
    from jsonb_array_elements(p_scope) elem
  ),
  resolved as (
    select
      oi.id,
      -- Absent quantity means the whole line; anything keyed is clamped
      -- into [1, line quantity] rather than trusted.
      least(greatest(1, coalesce(sel.quantity, oi.quantity)), oi.quantity) as quantity,
      -- Prorate at the precision the columns are declared at, matching
      -- lib/pricing.ts's round2 points exactly.
      round(oi.total_price * least(greatest(1, coalesce(sel.quantity, oi.quantity)), oi.quantity)
            / greatest(oi.quantity, 1), 2) as line_gross,
      round(oi.tax_amount  * least(greatest(1, coalesce(sel.quantity, oi.quantity)), oi.quantity)
            / greatest(oi.quantity, 1), 2) as line_tax
    from sel
    join public.order_items oi
      on oi.id = sel.order_item_id
     and oi.order_id = p_order_id
  )
  select
    count(*),
    coalesce(sum(line_gross), 0),
    coalesce(sum(line_tax), 0),
    coalesce(jsonb_agg(jsonb_build_object('order_item_id', id, 'quantity', quantity)
                       order by id), '[]'::jsonb)
    into v_matched, v_base_gross, v_base_tax, v_items
    from resolved;

  if v_matched <> v_count then
    raise exception 'A discounted item does not belong to this order';
  end if;

  return jsonb_build_object(
    'base_gross', v_base_gross,
    'base_tax', v_base_tax,
    'items', v_items,
    'warnings', v_warnings
  );
end;
$$;

revoke execute on function public._resolve_discount_scope(uuid, jsonb, boolean, jsonb)
  from public, anon, authenticated;


-- ============================================================
-- 3. _price_checkout — the same math, now over a base
--
-- A 9-argument sibling rather than a replacement. The base parameters
-- sit at positions 3-4 with NO defaults, so the existing 7-argument
-- calls in 00028 (sync_offline_order / sync_offline_payment) still
-- resolve unambiguously and need no edit. The 7-arg version becomes a
-- delegation, so there is still exactly one implementation of the
-- arithmetic in SQL -- the point 00019 §2 was making.
-- ============================================================

create or replace function public._price_checkout(
  p_gross numeric,           -- subtotal + tax at list price, tip excluded
  p_tax numeric,             -- the tax component of p_gross
  p_base_gross numeric,      -- the slice of p_gross the discount is taken on
  p_base_tax numeric,        -- the tax component of p_base_gross
  p_discount_type text,      -- 'percent' | 'amount' | null
  p_discount_value numeric,
  p_tip numeric,
  p_strict boolean,
  p_warnings jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_gross numeric(10,2) := coalesce(p_gross, 0);
  v_tax   numeric(10,2) := coalesce(p_tax, 0);
  v_base_gross numeric(10,2) := least(greatest(0, coalesce(p_base_gross, p_gross, 0)), coalesce(p_gross, 0));
  v_base_tax   numeric(10,2) := least(greatest(0, coalesce(p_base_tax, p_tax, 0)), coalesce(p_tax, 0));
  v_tip   numeric(10,2) := greatest(0, coalesce(p_tip, 0));
  v_discount_value numeric(10,2) := greatest(0, coalesce(p_discount_value, 0));
  v_discount numeric(10,2) := 0;
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
      v_discount := round(v_base_gross * v_discount_value / 100, 2);
    elsif p_discount_type = 'amount' then
      v_discount := round(v_discount_value, 2);
      if v_discount > v_base_gross then
        if p_strict then
          raise exception 'Discount is larger than the items it applies to';
        end if;
        -- Warning code unchanged: lib/offline/* already reads it.
        v_warnings := v_warnings || jsonb_build_object(
          'code', 'discount_exceeds_total', 'value', v_discount_value, 'gross', v_base_gross);
        v_discount := v_base_gross;
      end if;
    else
      raise exception 'Invalid discount type: %', p_discount_type;
    end if;
  end if;

  -- subtotal and tax start at list price. A discount only reaches the
  -- IVA sitting inside the lines it applies to: the tax on everything
  -- outside the base (v_tax - v_base_tax) is untouched, and the base's
  -- own tax is re-split in the original proportion. With a whole-order
  -- base this is 00018:178-183 term for term.
  v_subtotal := v_gross - v_tax;
  if v_discount > 0 and v_base_gross > 0 then
    v_tax := (v_tax - v_base_tax)
             + round(v_base_tax * (v_base_gross - v_discount) / v_base_gross, 2);
    v_subtotal := (v_gross - v_discount) - v_tax;
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

revoke execute on function public._price_checkout(
  numeric, numeric, numeric, numeric, text, numeric, numeric, boolean, jsonb
) from public, anon, authenticated;

-- The original signature, now a delegation: base = the whole order.
create or replace function public._price_checkout(
  p_gross numeric,
  p_tax numeric,
  p_discount_type text,
  p_discount_value numeric,
  p_tip numeric,
  p_strict boolean default true,
  p_warnings jsonb default '[]'::jsonb
)
returns jsonb
language sql
set search_path = public
as $$
  select public._price_checkout(
    p_gross, p_tax, p_gross, p_tax,
    p_discount_type, p_discount_value, p_tip, p_strict, p_warnings);
$$;

revoke execute on function public._price_checkout(numeric, numeric, text, numeric, numeric, boolean, jsonb)
  from public, anon, authenticated;


-- ============================================================
-- 4. complete_order — one new argument, p_discount_items
--
-- Dropped and recreated rather than overloaded: PostgREST cannot
-- resolve ambiguous overloads (00018:74-79), so the 11-argument version
-- has to go before the 12-argument one arrives.
-- ============================================================

drop function if exists public.complete_order(
  uuid, text, text, numeric, numeric, text, text, text, text, numeric, text
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
  p_discount_items jsonb default null
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
  uuid, text, text, numeric, numeric, text, text, text, text, numeric, text, jsonb
) from public, anon;
grant execute on function public.complete_order(
  uuid, text, text, numeric, numeric, text, text, text, text, numeric, text, jsonb
) to authenticated;


-- PostgREST caches the function signatures it exposes; without this the
-- till keeps calling the 11-argument complete_order that no longer
-- exists and every checkout fails until the cache happens to refresh.
notify pgrst, 'reload schema';
