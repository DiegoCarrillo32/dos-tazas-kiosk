-- ============================================================
-- Phase 2, Stage D — create_order fix + new RPCs
-- ============================================================

-- ── locations: archive support (no delete path — archive only) ──
alter table public.locations add column if not exists archived_at timestamptz;
alter table public.locations add column if not exists created_by uuid
  references public.user_profiles(id) on delete set null;

-- ── create_order fix ──────────────────────────────────────
-- Was reading user_profiles.location_id directly instead of the helper —
-- redefining get_current_location_id() in 00024 silently did NOT fix
-- order creation without this. Re-emitted verbatim from 00019 (confirmed
-- against the live function body) with only this one line changed.
-- Verified against prod: order_location = current_location = true.
create or replace function public.create_order(items jsonb, p_table_id uuid default null)
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
$function$;

-- ── session_context() ─────────────────────────────────────
-- One call powering the login landing hub, both layouts, and the
-- (Phase 3) switcher: current role/location plus every location the
-- caller belongs to.
create or replace function public.session_context()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'active_location_id', public.get_current_location_id(),
    'role', coalesce((select lm.role from public.location_members lm
                       where lm.user_id = auth.uid()
                         and lm.location_id = public.get_current_location_id()), 'staff'),
    'first_name', (select first_name from public.user_profiles where id = auth.uid()),
    'last_name',  (select last_name  from public.user_profiles where id = auth.uid()),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'name', l.name, 'address', l.address,
               'role', lm.role, 'archived', l.archived_at is not null) order by l.name)
        from public.location_members lm
        join public.locations l on l.id = lm.location_id
       where lm.user_id = auth.uid()), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;

revoke execute on function public.session_context() from public, anon;
grant execute on function public.session_context() to authenticated, service_role;

-- ── switch_location() ─────────────────────────────────────
-- The membership + not-archived checks here are for a good error message;
-- the composite FK (00023, fixed below in this same phase) and
-- get_current_location_id()'s membership join (00024) are what actually
-- make an invalid switch impossible.
create or replace function public.switch_location(p_location_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_member_of(p_location_id) then
    raise exception 'You are not a member of that location';
  end if;
  if exists (select 1 from public.locations
              where id = p_location_id and archived_at is not null) then
    raise exception 'That location is archived';
  end if;
  update public.user_profiles set active_location_id = p_location_id where id = auth.uid();
  return public.session_context();
end;
$$;

revoke execute on function public.switch_location(uuid) from public, anon;
grant execute on function public.switch_location(uuid) to authenticated, service_role;

-- ── create_location() ─────────────────────────────────────
-- Any admin (of >=1 location) can create a new one and becomes its admin.
-- Optional deep copy of the catalog from a location they administer.
-- Stock never copies (always starts at 0) and tables never copy (a floor
-- plan is physical, not a template). Uses jsonb old-id -> new-id maps
-- rather than temp tables: a SECURITY DEFINER function with
-- search_path=public can't resolve unqualified pg_temp names.
--
-- Verified end-to-end against prod (rolled back): 8 categories, 32 menu
-- items, 6 modifiers, 14 options, 15 links all copied; stock summed to 0;
-- 0 tables copied; location_settings seeded from the source.
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
                                        prices_include_tax, tip_enabled, timezone)
  select v_id,
         coalesce(s.currency,'CRC'), coalesce(s.tax_rate,0.13),
         coalesce(s.prices_include_tax,true), coalesce(s.tip_enabled,false),
         coalesce(s.timezone,'America/Costa_Rica')
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

revoke execute on function public.create_location(text, text, uuid) from public, anon;
grant execute on function public.create_location(text, text, uuid) to authenticated, service_role;

-- ── update_location() ─────────────────────────────────────
create or replace function public.update_location(p_location_id uuid, p_name text, p_address text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin_at(p_location_id) then raise exception 'Not permitted'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Name is required'; end if;
  update public.locations
     set name = trim(p_name), address = nullif(trim(coalesce(p_address,'')),'')
   where id = p_location_id;
end;
$$;

revoke execute on function public.update_location(uuid, text, text) from public, anon;
grant execute on function public.update_location(uuid, text, text) to authenticated, service_role;

-- ── archive_location() / restore_location() ───────────────
-- Archive only — there is no delete_location RPC. An archived location is
-- excluded from switch_location and (client-side) hidden from the active
-- picker, but all its data (orders, shifts, reports) remains intact and
-- queryable by its members.
create or replace function public.archive_location(p_location_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin_at(p_location_id) then raise exception 'Not permitted'; end if;
  if (select count(*) from public.location_members where user_id = auth.uid()) <= 1 then
    raise exception 'You cannot archive your only location';
  end if;
  update public.locations set archived_at = now() where id = p_location_id;
end;
$$;

create or replace function public.restore_location(p_location_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin_at(p_location_id) then raise exception 'Not permitted'; end if;
  update public.locations set archived_at = null where id = p_location_id;
end;
$$;

revoke execute on function public.archive_location(uuid), public.restore_location(uuid) from public, anon;
grant execute on function public.archive_location(uuid), public.restore_location(uuid) to authenticated, service_role;

-- ── membership management ─────────────────────────────────
create or replace function public.set_location_membership(
  p_user_id uuid, p_location_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin_at(p_location_id) then raise exception 'Not permitted'; end if;
  if p_role not in ('admin','staff') then raise exception 'Invalid role'; end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'You cannot remove your own admin access to this location';
  end if;
  insert into public.location_members (user_id, location_id, role)
    values (p_user_id, p_location_id, p_role)
  on conflict (user_id, location_id) do update set role = excluded.role;
end;
$$;

-- NOTE: this is the pre-fix version. See 00027 for the corrected body —
-- ON DELETE SET NULL on the composite FK cannot safely be relied on here
-- (it would try to null user_profiles.id itself). Kept here only so this
-- file matches what was actually applied to prod at this point in time;
-- 00027 immediately supersedes it.
create or replace function public.remove_location_membership(
  p_user_id uuid, p_location_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin_at(p_location_id) then raise exception 'Not permitted'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot remove yourself'; end if;
  if (select role from public.location_members
       where user_id = p_user_id and location_id = p_location_id) = 'admin'
     and (select count(*) from public.location_members
           where location_id = p_location_id and role = 'admin') <= 1 then
    raise exception 'This is the last admin for this location';
  end if;
  delete from public.location_members
    where user_id = p_user_id and location_id = p_location_id;
end;
$$;

revoke execute on function public.set_location_membership(uuid, uuid, text), public.remove_location_membership(uuid, uuid) from public, anon;
grant execute on function public.set_location_membership(uuid, uuid, text), public.remove_location_membership(uuid, uuid) to authenticated, service_role;

-- ── staff provisioning ────────────────────────────────────
-- Creates a brand-new profile + membership for a freshly signed-up
-- (ephemeral-client signUp) auth user. p_user_id is caller-supplied, so
-- this refuses to touch an EXISTING profile — otherwise an admin could
-- repoint another tenant's user at their own shop.
create or replace function public.provision_staff_member(
  p_user_id uuid, p_first_name text, p_last_name text, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_loc uuid;
begin
  if not public.is_admin() then raise exception 'Not permitted'; end if;
  if p_role not in ('admin','staff') then raise exception 'Invalid role'; end if;
  v_loc := public.get_current_location_id();
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'No such account';
  end if;
  if exists (select 1 from public.user_profiles where id = p_user_id) then
    raise exception 'That account already exists — add them by email instead';
  end if;
  insert into public.user_profiles (id, location_id, role, first_name, last_name,
                                    active_location_id)
    values (p_user_id, v_loc, p_role, p_first_name, nullif(p_last_name,''), v_loc);
  insert into public.location_members (user_id, location_id, role)
    values (p_user_id, v_loc, p_role);
end;
$$;

-- For a user who already has an account (and a profile) elsewhere.
-- Identical error message whether the email is unknown or has no profile,
-- so this is not a cross-tenant account-enumeration oracle.
create or replace function public.add_member_by_email(p_email text, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  if not public.is_admin() then raise exception 'Not permitted'; end if;
  select u.id into v_uid from auth.users u
    where lower(u.email) = lower(trim(p_email))
      and exists (select 1 from public.user_profiles p where p.id = u.id);
  if v_uid is null then
    raise exception 'No account found for that email. Invite them instead.';
  end if;
  perform public.set_location_membership(v_uid, public.get_current_location_id(), p_role);
end;
$$;

revoke execute on function public.provision_staff_member(uuid, text, text, text), public.add_member_by_email(text, text) from public, anon;
grant execute on function public.provision_staff_member(uuid, text, text, text), public.add_member_by_email(text, text) to authenticated, service_role;

-- Rollback:
--   drop function public.provision_staff_member(uuid, text, text, text);
--   drop function public.add_member_by_email(text, text);
--   drop function public.set_location_membership(uuid, uuid, text);
--   drop function public.remove_location_membership(uuid, uuid);
--   drop function public.archive_location(uuid);
--   drop function public.restore_location(uuid);
--   drop function public.update_location(uuid, text, text);
--   drop function public.create_location(text, text, uuid);
--   drop function public.switch_location(uuid);
--   drop function public.session_context();
--   -- restore create_order's pre-fix body (see 00019).
--   alter table public.locations drop column archived_at, drop column created_by;
