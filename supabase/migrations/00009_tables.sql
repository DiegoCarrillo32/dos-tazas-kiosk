-- ============================================================
-- Dos Tazas POS - Tables & running tabs
-- Run AFTER 00008_realtime_orders.sql
--
-- Adds admin-managed tables, links orders to a table (optional —
-- null = takeaway), and supports running tabs: append_to_order adds
-- items to an existing parked order. Pricing logic is factored into
-- shared helpers so create_order and append_to_order stay consistent.
-- ============================================================

-- ── TABLES ───────────────────────────────────────────────────────
create table public.tables (
  id uuid primary key default uuid_generate_v4(),
  location_id uuid references public.locations(id) not null,
  name text not null,
  sort_order integer default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.tables enable row level security;
create index idx_tables_location_id on public.tables(location_id);

create policy "tables_select" on public.tables
  for select to authenticated
  using (location_id = public.get_current_location_id());

create policy "tables_insert_admin" on public.tables
  for insert to authenticated
  with check (
    location_id = public.get_current_location_id()
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );

create policy "tables_update_admin" on public.tables
  for update to authenticated
  using (
    location_id = public.get_current_location_id()
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );

create policy "tables_delete_admin" on public.tables
  for delete to authenticated
  using (
    location_id = public.get_current_location_id()
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );

create trigger handle_updated_at before update on public.tables
  for each row execute procedure moddatetime (updated_at);

-- Link orders to a table (optional).
alter table public.orders add column table_id uuid references public.tables(id);
create index idx_orders_table_id on public.orders(table_id);

-- Realtime occupancy: tables change rarely, but expose for completeness.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tables'
  ) then
    alter publication supabase_realtime add table public.tables;
  end if;
end $$;


-- ── SHARED PRICING HELPERS ───────────────────────────────────────

-- Price and insert order_items (+ their modifiers) for an order, reading
-- all prices from the database. Used by both create_order and append_to_order.
create or replace function public._insert_priced_items(
  p_order_id uuid, items jsonb, p_location_id uuid
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
begin
  select tax_rate, prices_include_tax into v_tax_rate, v_inclusive
    from public.location_settings where location_id = p_location_id;
  v_tax_rate := coalesce(v_tax_rate, 0.13);
  v_inclusive := coalesce(v_inclusive, true);

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
        select mo.id, mo.name, mo.extra_price, m.name as modifier_name into v_opt
          from public.modifier_options mo
          join public.modifiers m on m.id = mo.modifier_id
          where mo.id = v_opt_id and m.location_id = p_location_id;
        if not found then
          raise exception 'Modifier option % not available', v_opt_id;
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

-- Recompute an order's money breakdown from its current order_items.
-- net = total_price - tax_amount holds for both inclusive and exclusive pricing.
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


-- ── create_order (rev 3) — now takes an optional table ───────────
drop function if exists public.create_order(jsonb);

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

  insert into public.orders (location_id, user_id, status, order_number, tax_rate, total_amount, table_id)
    values (v_location_id, v_user_id, 'draft', v_order_number, v_tax_rate, 0, p_table_id)
    returning id into v_order_id;

  perform public._insert_priced_items(v_order_id, items, v_location_id);
  perform public._recompute_order_totals(v_order_id);

  update public.orders set status = 'parked' where id = v_order_id;
  return v_order_id;
end;
$$;


-- ── append_to_order — add items to an existing parked tab ────────
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

  perform public._insert_priced_items(p_order_id, items, v_location_id);
  perform public._recompute_order_totals(p_order_id);
end;
$$;


-- ── GRANTS ───────────────────────────────────────────────────────
revoke execute on function public._insert_priced_items(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public._recompute_order_totals(uuid) from public, anon, authenticated;
revoke execute on function public.create_order(jsonb, uuid) from public, anon;
revoke execute on function public.append_to_order(uuid, jsonb) from public, anon;
grant execute on function public.create_order(jsonb, uuid) to authenticated;
grant execute on function public.append_to_order(uuid, jsonb) to authenticated;
