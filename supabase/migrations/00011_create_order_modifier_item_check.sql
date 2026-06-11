-- ============================================================
-- Dos Tazas POS - Security: validate modifier options belong to ordered item
-- Run AFTER 00010_tables_fk_and_one_tab.sql
--
-- Gap: the previous create_order only checked that a modifier_option
-- belonged to *some* modifier in the location.  A tampered request could
-- attach any location-wide modifier option to any item and have its
-- extra_price added server-side.
--
-- Fix: join menu_item_modifiers inside the option lookup so the option
-- is only accepted when its modifier is explicitly linked to the item
-- being ordered.  The existing `if not found` guard then rejects it.
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
  v_tax_rate := coalesce(v_tax_rate, 0.13);
  v_inclusive := coalesce(v_inclusive, true);

  v_order_number := public.next_order_number(v_location_id);

  insert into public.orders (location_id, user_id, status, order_number, tax_rate, total_amount)
    values (v_location_id, v_user_id, 'draft', v_order_number, v_tax_rate, 0)
    returning id into v_order_id;

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

    -- Availability guards (manual 86 + stock).
    if not v_menu_item.is_available then
      raise exception '% is sold out', v_menu_item.name;
    end if;
    if v_menu_item.track_inventory and v_menu_item.available_quantity < v_qty then
      raise exception 'Not enough stock for % (% left)', v_menu_item.name, v_menu_item.available_quantity;
    end if;

    v_unit_extra := 0;
    insert into public.order_items (order_id, menu_item_id, quantity, unit_price, total_price, notes)
      values (v_order_id, v_menu_item.id, v_qty, 0, 0, nullif(v_item->>'notes', ''))
      returning id into v_order_item_id;

    if v_item ? 'modifier_option_ids' then
      for v_opt_id in
        select (value)::uuid from jsonb_array_elements_text(v_item->'modifier_option_ids')
      loop
        -- Require the option's modifier to be explicitly linked to this item.
        select mo.id, mo.name, mo.extra_price, m.name as modifier_name
          into v_opt
          from public.modifier_options mo
          join public.modifiers m on m.id = mo.modifier_id
          join public.menu_item_modifiers mim
            on mim.modifier_id = mo.modifier_id
           and mim.menu_item_id = v_menu_item.id
          where mo.id = v_opt_id
            and m.location_id = v_location_id;
        if not found then
          raise exception 'Modifier option % is not valid for item %',
            v_opt_id, v_menu_item.name;
        end if;

        v_unit_extra := v_unit_extra + v_opt.extra_price;

        insert into public.order_item_modifiers (order_item_id, modifier_option_id, name, extra_price)
          values (v_order_item_id, v_opt.id,
                  v_opt.modifier_name || ': ' || v_opt.name, v_opt.extra_price);
      end loop;
    end if;

    v_unit_price := v_menu_item.price + v_unit_extra;
    v_line_total := v_unit_price * v_qty;

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
