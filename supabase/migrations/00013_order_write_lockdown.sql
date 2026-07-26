-- ============================================================
-- Dos Tazas POS - Order write lockdown & audit trail
-- Run AFTER 00012_aggregate_stock_guard.sql
--
-- Problem this fixes:
--   The RLS policies on orders / order_items / order_item_modifiers
--   allowed ANY authenticated user at the location to INSERT, UPDATE and
--   DELETE rows directly. That made the server-authoritative pricing in
--   create_order()/complete_order() bypassable: a staff login could
--   rewrite a completed sale's total, flip its status, or delete the row
--   outright — destroying the audit trail and any hope of reconciling
--   the cash drawer.
--
--   A stale create_order(items jsonb) overload from 00005 was also still
--   present and granted to PUBLIC/anon. It duplicated the pricing engine
--   and predated the guards added in 00011/00012.
--
-- After this migration, orders and their children are READ-ONLY to
-- clients. Every mutation goes through a SECURITY DEFINER RPC, which
-- runs as the function owner and is unaffected by RLS. The existing
-- create_order / append_to_order / complete_order flows are untouched:
-- staff keep taking orders, adding to tabs and checking out exactly as
-- before.
-- ============================================================


-- ============================================================
-- 1. Remove the stale create_order(items jsonb) overload
-- ============================================================

drop function if exists public.create_order(jsonb);


-- ============================================================
-- 2. Apply 00011's modifier→item check to the LIVE code path
--
-- 00011 added the "option's modifier must be linked to this item" check
-- to create_order(items jsonb) — the single-arg overload just dropped
-- above. The path actually used by the Floor since 00009 is
-- create_order(items, p_table_id) → _insert_priced_items(), which never
-- received the fix. Verified against the live database: the deployed
-- _insert_priced_items body contains no reference to menu_item_modifiers.
--
-- Without it, any modifier option in the location can be attached to any
-- item (e.g. an option belonging to a different product).
-- ============================================================

create or replace function public._insert_priced_items(
  p_order_id uuid,
  items jsonb,
  p_location_id uuid
)
returns void
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
      raise exception 'Not enough stock for % (% left, % requested)',
        v_agg.name, v_agg.available_quantity, v_agg.total_qty;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(items)
  loop
    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));

    select * into v_menu_item from public.menu_items
      where id = (v_item->>'menu_item_id')::uuid
        and location_id = p_location_id and is_active = true;
    if not found then
      raise exception 'Menu item % not available', v_item->>'menu_item_id';
    end if;
    if not v_menu_item.is_available then
      raise exception '% is sold out', v_menu_item.name;
    end if;
    -- Per-line safety net (aggregate check above is the primary guard).
    if v_menu_item.track_inventory and v_menu_item.available_quantity < v_qty then
      raise exception 'Not enough stock for % (% left)', v_menu_item.name, v_menu_item.available_quantity;
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
          raise exception 'Modifier option % is not valid for item %',
            v_opt_id, v_menu_item.name;
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
end;
$$;


-- ============================================================
-- 3. 'refunded' order status
-- ============================================================

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('draft', 'parked', 'completed', 'cancelled', 'refunded'));


-- ============================================================
-- 4. Admin helper
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.user_profiles where id = auth.uid()),
    false
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;


-- ============================================================
-- 5. Audit trail
--
-- Append-only record of every non-routine thing that happens to an
-- order: voids and refunds. Written only from inside the RPCs below, so
-- there are no INSERT/UPDATE/DELETE policies at all — just admin SELECT.
-- ============================================================

create table public.order_audit (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  location_id uuid references public.locations(id) on delete cascade not null,
  action text not null check (action in ('void', 'refund')),
  actor_id uuid references public.user_profiles(id) on delete set null,
  reason text,
  order_snapshot jsonb,
  created_at timestamptz default now() not null
);

create index order_audit_location_created_idx
  on public.order_audit (location_id, created_at desc);

alter table public.order_audit enable row level security;

create policy "order_audit_select_admin" on public.order_audit
  for select to authenticated
  using (location_id = public.get_current_location_id() and public.is_admin());


-- ============================================================
-- 6. void_order — cancel an UNPAID order
--
-- Available to all staff: a parked order never took any money, and
-- making a barista hunt for an admin when a customer walks away would
-- hurt service. Records who did it and why.
--
-- Note: inventory is decremented in complete_order, not create_order, so
-- an unpaid order holds no stock and nothing needs restoring here.
-- ============================================================

create or replace function public.void_order(
  p_order_id uuid,
  p_reason text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_location_id := public.get_current_location_id();

  select * into v_order from public.orders
    where id = p_order_id and location_id = v_location_id;
  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status not in ('draft', 'parked') then
    raise exception 'Only unpaid orders can be voided (status: %). Use a refund instead.',
      v_order.status;
  end if;

  update public.orders set status = 'cancelled' where id = p_order_id;

  insert into public.order_audit (order_id, location_id, action, actor_id, reason, order_snapshot)
    values (p_order_id, v_location_id, 'void', auth.uid(), nullif(p_reason, ''), to_jsonb(v_order));
end;
$$;

revoke execute on function public.void_order(uuid, text) from public, anon;
grant execute on function public.void_order(uuid, text) to authenticated;


-- ============================================================
-- 7. reverse_completed_order — refund a PAID order (admin only)
--
-- Safety valve: with direct table writes blocked, a miskeyed completed
-- sale would otherwise have no correction path at all. Restores stock,
-- audits, and (via the shift reporting in 00014) removes the sale from
-- expected cash.
--
-- This is deliberately minimal: full-amount reversal only. No partial
-- refunds and no card-network refund flow.
-- ============================================================

create or replace function public.reverse_completed_order(
  p_order_id uuid,
  p_reason text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_admin() then
    raise exception 'Only an admin can refund a completed order';
  end if;

  v_location_id := public.get_current_location_id();

  select * into v_order from public.orders
    where id = p_order_id and location_id = v_location_id;
  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status <> 'completed' then
    raise exception 'Only a completed order can be refunded (status: %)', v_order.status;
  end if;

  update public.orders set status = 'refunded' where id = p_order_id;

  -- Put the stock back that complete_order took out.
  update public.menu_items mi
    set available_quantity = mi.available_quantity + oi.qty
    from (
      select menu_item_id, sum(quantity) as qty
      from public.order_items
      where order_id = p_order_id
      group by menu_item_id
    ) oi
    where mi.id = oi.menu_item_id
      and mi.track_inventory = true;

  insert into public.order_audit (order_id, location_id, action, actor_id, reason, order_snapshot)
    values (p_order_id, v_location_id, 'refund', auth.uid(), nullif(p_reason, ''), to_jsonb(v_order));
end;
$$;

revoke execute on function public.reverse_completed_order(uuid, text) from public, anon;
grant execute on function public.reverse_completed_order(uuid, text) to authenticated;


-- ============================================================
-- 8. THE LOCKDOWN — make orders & children read-only to clients
--
-- Nothing in the app writes these tables directly any more:
--   * order creation   → create_order()      (SECURITY DEFINER)
--   * tab append       → append_to_order()   (SECURITY DEFINER)
--   * checkout         → complete_order()    (SECURITY DEFINER)
--   * void             → void_order()        (SECURITY DEFINER)
--   * refund           → reverse_completed_order() (SECURITY DEFINER)
-- SECURITY DEFINER functions run as the owner and bypass RLS, so all of
-- the above keep working. Only hand-rolled REST writes are blocked.
--
-- The SELECT policies are left exactly as they are.
-- ============================================================

drop policy if exists "orders_insert" on public.orders;
drop policy if exists "orders_update" on public.orders;
drop policy if exists "orders_delete" on public.orders;

drop policy if exists "order_items_insert" on public.order_items;
drop policy if exists "order_items_update" on public.order_items;
drop policy if exists "order_items_delete" on public.order_items;

drop policy if exists "order_item_modifiers_insert" on public.order_item_modifiers;
