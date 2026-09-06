-- ============================================================
-- Dos Tazas POS - Archive instead of delete for menu items
-- Run AFTER 00030_item_scoped_discounts.sql
--
-- Problem this fixes:
--   The admin Menu page's delete button did nothing at all -- no toast,
--   no error, the row just stayed. Two layers were at fault.
--
--   1. order_items.menu_item_id is `references public.menu_items(id) not
--      null` with NO `on delete` clause (00001_initial_schema.sql:119),
--      so it defaults to NO ACTION. Any item that has ever appeared on
--      any order -- draft, parked, completed, cancelled -- is
--      permanently undeletable and Postgres raises 23503.
--   2. app/admin/menu/page.tsx passed no onError to the mutation, so the
--      rejection was discarded silently.
--
--   00010_tables_fk_and_one_tab.sql fixed the same class of bug for
--   tables by switching orders.table_id to `on delete set null`. That
--   remedy is NOT available here: the column is `not null`, and unlike
--   order_item_modifiers (which denormalizes `name`, 00001:134) an
--   order_item keeps no copy of the product name -- it reads it back
--   through this FK for every receipt reprint
--   (lib/queries.ts:754 `menu_item:menu_items(name)`). Dropping the
--   reference would blank the product name on every historical receipt.
--
--   So: an item that has never been sold is genuinely deleted; an item
--   with history is archived. Archived rows keep serving their name to
--   old receipts and to reporting while disappearing from the POS floor
--   and (by default) from the admin list. This mirrors
--   archive_location/restore_location (00026:232-257), the established
--   archive-instead-of-delete precedent in this schema.
--
--   modifier_options carry the identical restricting FK
--   (order_item_modifiers.modifier_option_id, 00001:133) and get the
--   same treatment.
-- ============================================================

-- ── 1. archived_at columns ─────────────────────────────────
alter table public.menu_items
  add column if not exists archived_at timestamptz;

alter table public.modifier_options
  add column if not exists archived_at timestamptz;

alter table public.modifiers
  add column if not exists archived_at timestamptz;

-- The POS floor and the admin list both read "live items at my location",
-- which is now a partial-index scan rather than a filter on every row.
create index if not exists idx_menu_items_live
  on public.menu_items(location_id) where archived_at is null;


-- ── 2. delete_menu_item() ──────────────────────────────────
-- One entry point for the UI. Returns which branch ran ('deleted' |
-- 'archived') so the page can tell the truth in its toast instead of
-- guessing. Guarded like every other admin RPC: is_admin() at the
-- caller's active location, and the row must belong to that location.
create or replace function public.delete_menu_item(p_item_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_location_id uuid;
  v_item_location uuid;
  v_has_history boolean;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can remove menu items';
  end if;

  v_location_id := public.get_current_location_id();

  select location_id into v_item_location
    from public.menu_items where id = p_item_id;
  if v_item_location is null then
    raise exception 'Menu item not found';
  end if;
  if v_item_location <> v_location_id then
    raise exception 'That menu item belongs to another location';
  end if;

  select exists (
    select 1 from public.order_items where menu_item_id = p_item_id
  ) into v_has_history;

  if v_has_history then
    -- is_active/is_available go false too, so the item leaves the POS
    -- floor immediately rather than lingering until the next cache bust.
    update public.menu_items
       set archived_at = now(),
           is_active = false,
           is_available = false,
           updated_at = now()
     where id = p_item_id;
    return 'archived';
  end if;

  -- menu_item_modifiers cascades (00001:89), so no cleanup needed.
  delete from public.menu_items where id = p_item_id;
  return 'deleted';
end;
$$;

revoke execute on function public.delete_menu_item(uuid) from public, anon;
grant execute on function public.delete_menu_item(uuid) to authenticated, service_role;


-- ── 3. restore_menu_item() ─────────────────────────────────
-- Clears the archive. is_available stays false: bringing a product back
-- is a menu decision, marking it in stock is a shift decision, and
-- conflating them would silently re-list something the kitchen can't
-- make. The admin toggles availability separately.
create or replace function public.restore_menu_item(p_item_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_location_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can restore menu items';
  end if;

  v_location_id := public.get_current_location_id();

  update public.menu_items
     set archived_at = null,
         is_active = true,
         updated_at = now()
   where id = p_item_id
     and location_id = v_location_id;

  if not found then
    raise exception 'Menu item not found at this location';
  end if;
end;
$$;

revoke execute on function public.restore_menu_item(uuid) from public, anon;
grant execute on function public.restore_menu_item(uuid) to authenticated, service_role;


-- ── 4. delete_modifier_option() ────────────────────────────
-- Same shape, keyed on order_item_modifiers.
create or replace function public.delete_modifier_option(p_option_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_location_id uuid;
  v_opt_location uuid;
  v_has_history boolean;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can remove modifier options';
  end if;

  v_location_id := public.get_current_location_id();

  select m.location_id into v_opt_location
    from public.modifier_options mo
    join public.modifiers m on m.id = mo.modifier_id
   where mo.id = p_option_id;
  if v_opt_location is null then
    raise exception 'Modifier option not found';
  end if;
  if v_opt_location <> v_location_id then
    raise exception 'That modifier option belongs to another location';
  end if;

  select exists (
    select 1 from public.order_item_modifiers where modifier_option_id = p_option_id
  ) into v_has_history;

  if v_has_history then
    update public.modifier_options set archived_at = now() where id = p_option_id;
    return 'archived';
  end if;

  delete from public.modifier_options where id = p_option_id;
  return 'deleted';
end;
$$;

revoke execute on function public.delete_modifier_option(uuid) from public, anon;
grant execute on function public.delete_modifier_option(uuid) to authenticated, service_role;


-- ── 5. delete_modifier() ───────────────────────────────────
-- modifier_options cascades from modifiers (00001:79), so deleting a
-- group whose options have sales history would cascade straight into the
-- same 23503. Archive the whole group in that case instead.
create or replace function public.delete_modifier(p_modifier_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_location_id uuid;
  v_mod_location uuid;
  v_has_history boolean;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can remove modifiers';
  end if;

  v_location_id := public.get_current_location_id();

  select location_id into v_mod_location
    from public.modifiers where id = p_modifier_id;
  if v_mod_location is null then
    raise exception 'Modifier not found';
  end if;
  if v_mod_location <> v_location_id then
    raise exception 'That modifier belongs to another location';
  end if;

  select exists (
    select 1
      from public.order_item_modifiers oim
      join public.modifier_options mo on mo.id = oim.modifier_option_id
     where mo.modifier_id = p_modifier_id
  ) into v_has_history;

  if v_has_history then
    update public.modifiers set archived_at = now() where id = p_modifier_id;
    update public.modifier_options set archived_at = now()
      where modifier_id = p_modifier_id and archived_at is null;
    -- Unlink it from every product so the POS stops offering it.
    delete from public.menu_item_modifiers where modifier_id = p_modifier_id;
    return 'archived';
  end if;

  delete from public.modifiers where id = p_modifier_id;
  return 'deleted';
end;
$$;

revoke execute on function public.delete_modifier(uuid) from public, anon;
grant execute on function public.delete_modifier(uuid) to authenticated, service_role;


-- ============================================================
-- Rollback:
--   drop function if exists public.delete_menu_item(uuid);
--   drop function if exists public.restore_menu_item(uuid);
--   drop function if exists public.delete_modifier_option(uuid);
--   drop function if exists public.delete_modifier(uuid);
--   drop index if exists public.idx_menu_items_live;
--   alter table public.menu_items drop column if exists archived_at;
--   alter table public.modifier_options drop column if exists archived_at;
--   alter table public.modifiers drop column if exists archived_at;
-- ============================================================
