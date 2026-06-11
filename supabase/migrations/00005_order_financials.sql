-- ============================================================
-- Dos Tazas POS - Order Financials & Server-Authoritative Orders
-- Run AFTER 00001_initial_schema.sql … 00004_modifiers_rls_policies.sql
--
-- Adds:
--   * location_settings  (tax rate, currency, business/fiscal info)
--   * money breakdown columns on orders / order_items
--   * per-location daily order numbering
--   * create_order() / complete_order() RPCs that compute and
--     validate all pricing on the server (clients can no longer
--     set prices or totals).
-- ============================================================


-- ============================================================
-- LOCATION SETTINGS
-- ============================================================

create table public.location_settings (
  location_id uuid primary key references public.locations(id) on delete cascade,
  currency text default 'CRC' not null,
  tax_rate numeric(5,4) default 0.13 not null,          -- IVA, e.g. 0.1300 = 13%
  prices_include_tax boolean default true not null,      -- menu prices already contain IVA
  tip_enabled boolean default false not null,
  business_legal_name text,
  tax_id text,                                           -- cédula jurídica
  address text,
  phone text,
  receipt_footer text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.location_settings enable row level security;

create policy "location_settings_select" on public.location_settings
  for select to authenticated
  using (location_id = public.get_current_location_id());

create policy "location_settings_insert_admin" on public.location_settings
  for insert to authenticated
  with check (
    location_id = public.get_current_location_id()
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );

create policy "location_settings_update_admin" on public.location_settings
  for update to authenticated
  using (
    location_id = public.get_current_location_id()
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );

create trigger handle_updated_at before update on public.location_settings
  for each row execute procedure moddatetime (updated_at);

-- Seed a settings row for every existing location
insert into public.location_settings (location_id)
  select id from public.locations
  on conflict (location_id) do nothing;


-- ============================================================
-- ORDER MONEY BREAKDOWN
-- ============================================================

alter table public.orders
  add column order_number integer,
  add column subtotal numeric(10,2) default 0.00 not null,
  add column tax_amount numeric(10,2) default 0.00 not null,
  add column tax_rate numeric(5,4) default 0.13 not null,        -- snapshot at sale time
  add column discount_amount numeric(10,2) default 0.00 not null,
  add column tip_amount numeric(10,2) default 0.00 not null,
  add column amount_tendered numeric(10,2),
  add column change_due numeric(10,2);

-- Per-item tax portion (denormalized snapshot for receipts/reports)
alter table public.order_items
  add column tax_amount numeric(10,2) default 0.00 not null;

-- Backfill existing rows: treat the historical total as the subtotal so
-- subtotal + tax + tip - discount still reconciles to total_amount.
update public.orders set subtotal = total_amount where subtotal = 0;

-- Backfill sequential order numbers per location, ordered by creation time.
with numbered as (
  select id,
         row_number() over (partition by location_id order by created_at) as rn
  from public.orders
)
update public.orders o
  set order_number = numbered.rn
  from numbered
  where o.id = numbered.id and o.order_number is null;


-- ============================================================
-- DAILY ORDER NUMBER COUNTER
-- ============================================================

create table public.order_counters (
  location_id uuid references public.locations(id) on delete cascade not null,
  order_date date not null,
  last_number integer default 0 not null,
  primary key (location_id, order_date)
);
alter table public.order_counters enable row level security;
-- No policies: only reachable through the security-definer RPCs below.

-- Atomically allocate the next per-location, per-day order number.
create or replace function public.next_order_number(p_location_id uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  insert into public.order_counters (location_id, order_date, last_number)
    values (p_location_id, current_date, 1)
  on conflict (location_id, order_date)
    do update set last_number = public.order_counters.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$;


-- ============================================================
-- create_order RPC  (Floor → "Send to Counter")
--
-- Input: items jsonb array, each element:
--   { "menu_item_id": uuid,
--     "quantity": int,
--     "notes": text|null,
--     "modifier_option_ids": [uuid, ...] }
--
-- All prices are re-read from the database; any price the client
-- might send is ignored. Returns the new order id.
-- ============================================================

create or replace function public.create_order(items jsonb)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_user_id uuid;
  v_tax_rate numeric(5,4);
  v_inclusive boolean;
  v_order_id uuid;
  v_order_number integer;
  v_subtotal numeric(10,2) := 0;
  v_tax_total numeric(10,2) := 0;
  v_item jsonb;
  v_menu_item public.menu_items;
  v_qty integer;
  v_unit_extra numeric(10,2);
  v_unit_price numeric(10,2);
  v_line_total numeric(10,2);
  v_line_tax numeric(10,2);
  v_line_net numeric(10,2);
  v_order_item_id uuid;
  v_opt_id uuid;
  v_opt record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select location_id into v_location_id
    from public.user_profiles where id = v_user_id;
  if v_location_id is null then
    raise exception 'No location for user';
  end if;

  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Order has no items';
  end if;

  select tax_rate, prices_include_tax
    into v_tax_rate, v_inclusive
    from public.location_settings where location_id = v_location_id;
  -- Fall back to sensible defaults if no settings row exists yet.
  v_tax_rate := coalesce(v_tax_rate, 0.13);
  v_inclusive := coalesce(v_inclusive, true);

  v_order_number := public.next_order_number(v_location_id);

  insert into public.orders (location_id, user_id, status, order_number, tax_rate, total_amount)
    values (v_location_id, v_user_id, 'draft', v_order_number, v_tax_rate, 0)
    returning id into v_order_id;

  -- Walk each cart line, pricing it from authoritative DB values.
  for v_item in select * from jsonb_array_elements(items)
  loop
    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));

    select * into v_menu_item
      from public.menu_items
      where id = (v_item->>'menu_item_id')::uuid
        and location_id = v_location_id
        and is_active = true;
    if not found then
      raise exception 'Menu item % not available', v_item->>'menu_item_id';
    end if;

    -- Sum the extra price of each selected modifier option (validated to
    -- belong to a modifier in this location).
    v_unit_extra := 0;
    insert into public.order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes)
      values (v_order_id, v_menu_item.id, v_qty, 0, 0, nullif(v_item->>'notes', ''))
      returning id into v_order_item_id;

    if v_item ? 'modifier_option_ids' then
      for v_opt_id in
        select (value)::uuid from jsonb_array_elements_text(v_item->'modifier_option_ids')
      loop
        select mo.id, mo.name, mo.extra_price, m.name as modifier_name
          into v_opt
          from public.modifier_options mo
          join public.modifiers m on m.id = mo.modifier_id
          where mo.id = v_opt_id
            and m.location_id = v_location_id;
        if not found then
          raise exception 'Modifier option % not available', v_opt_id;
        end if;

        v_unit_extra := v_unit_extra + v_opt.extra_price;

        insert into public.order_item_modifiers (order_item_id, modifier_option_id, name, extra_price)
          values (v_order_item_id, v_opt.id,
                  v_opt.modifier_name || ': ' || v_opt.name, v_opt.extra_price);
      end loop;
    end if;

    v_unit_price := v_menu_item.price + v_unit_extra;
    v_line_total := v_unit_price * v_qty;

    -- Split the line into net + tax depending on the pricing model.
    if v_inclusive then
      v_line_tax := round(v_line_total - (v_line_total / (1 + v_tax_rate)), 2);
      v_line_net := v_line_total - v_line_tax;
    else
      v_line_net := v_line_total;
      v_line_tax := round(v_line_total * v_tax_rate, 2);
    end if;

    update public.order_items
      set unit_price = v_unit_price,
          total_price = case when v_inclusive then v_line_total else v_line_total + v_line_tax end,
          tax_amount = v_line_tax
      where id = v_order_item_id;

    v_subtotal := v_subtotal + v_line_net;
    v_tax_total := v_tax_total + v_line_tax;
  end loop;

  update public.orders
    set status = 'parked',
        subtotal = v_subtotal,
        tax_amount = v_tax_total,
        total_amount = v_subtotal + v_tax_total
    where id = v_order_id;

  return v_order_id;
end;
$$;


-- ============================================================
-- complete_order RPC  (Counter → payment)
--
-- Validates the order belongs to the caller's location and is parked,
-- applies tip, computes change for cash, and marks it completed.
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
  v_tip numeric(10,2);
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
  v_total := v_order.subtotal + v_order.tax_amount - v_order.discount_amount + v_tip;

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
        total_amount = v_total,
        amount_tendered = case when p_payment_method = 'cash' then p_amount_tendered else null end,
        change_due = v_change,
        customer_name = p_customer_name,
        customer_id = p_customer_id,
        customer_email = p_customer_email
    where id = p_order_id;
end;
$$;


-- ============================================================
-- GRANTS
-- ============================================================

-- Postgres grants EXECUTE to PUBLIC by default; revoke it so only signed-in
-- users can reach the order RPCs (they also self-check auth.uid()).
revoke execute on function public.create_order(jsonb) from public, anon;
revoke execute on function public.complete_order(uuid, text, text, numeric, numeric, text, text, text) from public, anon;
revoke execute on function public.next_order_number(uuid) from public, anon, authenticated;

grant execute on function public.create_order(jsonb) to authenticated;
grant execute on function public.complete_order(uuid, text, text, numeric, numeric, text, text, text) to authenticated;
-- next_order_number is internal (called within create_order's definer context).
