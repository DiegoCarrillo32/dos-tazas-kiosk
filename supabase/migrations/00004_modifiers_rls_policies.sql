-- ============================================================
-- Modifiers and Options - Admin RLS Write Policies
-- Run AFTER 00001_initial_schema.sql and 00003_staff_management.sql
-- ============================================================

-- Allow admins to insert/update/delete modifiers
create policy "modifiers_insert_admin" on public.modifiers
  for insert to authenticated
  with check (
    location_id = public.get_current_location_id()
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );

create policy "modifiers_update_admin" on public.modifiers
  for update to authenticated
  using (
    location_id = public.get_current_location_id()
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );

create policy "modifiers_delete_admin" on public.modifiers
  for delete to authenticated
  using (
    location_id = public.get_current_location_id()
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );

-- Allow admins to insert/update/delete modifier options
create policy "modifier_options_insert_admin" on public.modifier_options
  for insert to authenticated
  with check (
    modifier_id in (select id from public.modifiers where location_id = public.get_current_location_id())
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );

create policy "modifier_options_update_admin" on public.modifier_options
  for update to authenticated
  using (
    modifier_id in (select id from public.modifiers where location_id = public.get_current_location_id())
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );

create policy "modifier_options_delete_admin" on public.modifier_options
  for delete to authenticated
  using (
    modifier_id in (select id from public.modifiers where location_id = public.get_current_location_id())
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );

-- Allow admins to insert/update/delete menu item modifiers link
create policy "menu_item_modifiers_insert_admin" on public.menu_item_modifiers
  for insert to authenticated
  with check (
    menu_item_id in (select id from public.menu_items where location_id = public.get_current_location_id())
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );

create policy "menu_item_modifiers_delete_admin" on public.menu_item_modifiers
  for delete to authenticated
  using (
    menu_item_id in (select id from public.menu_items where location_id = public.get_current_location_id())
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );
