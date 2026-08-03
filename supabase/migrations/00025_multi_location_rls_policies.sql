-- ============================================================
-- Phase 2, Stage C — RLS policy rewrite
-- ============================================================
-- Replaces every inlined `(select role from user_profiles where id =
-- auth.uid()) = 'admin'` predicate with public.is_admin() (now
-- membership-backed as of 00024). Also:
--   - widens locations_select to is_member_of() so a future switcher can
--     list all of a user's locations, not just the active one
--   - adds location_members_select (membership-gated, so it never leaks
--     a member's OTHER locations to someone outside them)
--   - fixes the menu_item_modifiers insert gap: it validated menu_item_id's
--     location but not modifier_id's, so an admin could link two items
--     from different locations together. Verified against prod: blocked
--     with 42501 after this migration.
--   - makes UPDATE policies' with_check explicit (they relied on USING
--     being reused, which happened to block cross-location row moves —
--     make that guarantee explicit rather than incidental)
--
-- admin_insert_user_profiles / admin_update_user_profiles /
-- admin_delete_user_profiles (00003) are intentionally NOT dropped here —
-- lib/queries.ts (inviteStaffMember, updateStaffRole, removeStaffProfile)
-- still writes user_profiles directly and depends on them. They're
-- rewritten in place to use is_admin(), and will be dropped in Phase 3
-- once the app switches to the membership RPCs.

-- ── locations ──────────────────────────────────────────────
drop policy if exists "locations_select" on public.locations;
create policy "locations_select" on public.locations
  for select to authenticated
  using (public.is_member_of(id));

-- ── location_members ───────────────────────────────────────
create policy "location_members_select" on public.location_members
  for select to authenticated
  using (public.is_member_of(location_id));
-- No write policies: set_location_membership / remove_location_membership /
-- provision_staff_member / create_location (00026) are the only writers.

-- ── user_profiles ──────────────────────────────────────────
drop policy if exists "user_profiles_select" on public.user_profiles;
create policy "user_profiles_select" on public.user_profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_location_with(id));

drop policy if exists "admin_insert_user_profiles" on public.user_profiles;
create policy "admin_insert_user_profiles" on public.user_profiles
  for insert to authenticated
  with check (location_id = public.get_current_location_id() and public.is_admin());

drop policy if exists "admin_update_user_profiles" on public.user_profiles;
create policy "admin_update_user_profiles" on public.user_profiles
  for update to authenticated
  using (location_id = public.get_current_location_id() and public.is_admin())
  with check (location_id = public.get_current_location_id() and public.is_admin());

drop policy if exists "admin_delete_user_profiles" on public.user_profiles;
create policy "admin_delete_user_profiles" on public.user_profiles
  for delete to authenticated
  using (location_id = public.get_current_location_id() and public.is_admin() and id <> auth.uid());

-- ── categories ─────────────────────────────────────────────
drop policy if exists "categories_insert_admin" on public.categories;
create policy "categories_insert_admin" on public.categories
  for insert to authenticated
  with check (location_id = public.get_current_location_id() and public.is_admin());

drop policy if exists "categories_update_admin" on public.categories;
create policy "categories_update_admin" on public.categories
  for update to authenticated
  using (location_id = public.get_current_location_id() and public.is_admin())
  with check (location_id = public.get_current_location_id() and public.is_admin());

drop policy if exists "categories_delete_admin" on public.categories;
create policy "categories_delete_admin" on public.categories
  for delete to authenticated
  using (location_id = public.get_current_location_id() and public.is_admin());

-- ── menu_items ─────────────────────────────────────────────
drop policy if exists "menu_items_insert_admin" on public.menu_items;
create policy "menu_items_insert_admin" on public.menu_items
  for insert to authenticated
  with check (location_id = public.get_current_location_id() and public.is_admin());

drop policy if exists "menu_items_update_admin" on public.menu_items;
create policy "menu_items_update_admin" on public.menu_items
  for update to authenticated
  using (location_id = public.get_current_location_id() and public.is_admin())
  with check (location_id = public.get_current_location_id() and public.is_admin());

drop policy if exists "menu_items_delete_admin" on public.menu_items;
create policy "menu_items_delete_admin" on public.menu_items
  for delete to authenticated
  using (location_id = public.get_current_location_id() and public.is_admin());

-- ── modifiers ──────────────────────────────────────────────
drop policy if exists "modifiers_insert_admin" on public.modifiers;
create policy "modifiers_insert_admin" on public.modifiers
  for insert to authenticated
  with check (location_id = public.get_current_location_id() and public.is_admin());

drop policy if exists "modifiers_update_admin" on public.modifiers;
create policy "modifiers_update_admin" on public.modifiers
  for update to authenticated
  using (location_id = public.get_current_location_id() and public.is_admin())
  with check (location_id = public.get_current_location_id() and public.is_admin());

drop policy if exists "modifiers_delete_admin" on public.modifiers;
create policy "modifiers_delete_admin" on public.modifiers
  for delete to authenticated
  using (location_id = public.get_current_location_id() and public.is_admin());

-- ── modifier_options ───────────────────────────────────────
drop policy if exists "modifier_options_insert_admin" on public.modifier_options;
create policy "modifier_options_insert_admin" on public.modifier_options
  for insert to authenticated
  with check (
    public.is_admin()
    and modifier_id in (select id from public.modifiers where location_id = public.get_current_location_id())
  );

drop policy if exists "modifier_options_update_admin" on public.modifier_options;
create policy "modifier_options_update_admin" on public.modifier_options
  for update to authenticated
  using (
    public.is_admin()
    and modifier_id in (select id from public.modifiers where location_id = public.get_current_location_id())
  )
  with check (
    public.is_admin()
    and modifier_id in (select id from public.modifiers where location_id = public.get_current_location_id())
  );

drop policy if exists "modifier_options_delete_admin" on public.modifier_options;
create policy "modifier_options_delete_admin" on public.modifier_options
  for delete to authenticated
  using (
    public.is_admin()
    and modifier_id in (select id from public.modifiers where location_id = public.get_current_location_id())
  );

-- ── menu_item_modifiers ────────────────────────────────────
-- Fixes the gap: the old insert policy checked only menu_item_id's
-- location, not modifier_id's, so a compromised/careless admin session
-- could link a menu item to another location's modifier. The ordering
-- path was never at risk (_insert_priced_items already requires the
-- modifier be in-location), but the catalog itself could be corrupted.
drop policy if exists "menu_item_modifiers_insert_admin" on public.menu_item_modifiers;
create policy "menu_item_modifiers_insert_admin" on public.menu_item_modifiers
  for insert to authenticated
  with check (
    public.is_admin()
    and menu_item_id in (select id from public.menu_items where location_id = public.get_current_location_id())
    and modifier_id in (select id from public.modifiers where location_id = public.get_current_location_id())
  );

drop policy if exists "menu_item_modifiers_delete_admin" on public.menu_item_modifiers;
create policy "menu_item_modifiers_delete_admin" on public.menu_item_modifiers
  for delete to authenticated
  using (
    public.is_admin()
    and menu_item_id in (select id from public.menu_items where location_id = public.get_current_location_id())
  );

-- ── tables ─────────────────────────────────────────────────
drop policy if exists "tables_insert_admin" on public.tables;
create policy "tables_insert_admin" on public.tables
  for insert to authenticated
  with check (location_id = public.get_current_location_id() and public.is_admin());

drop policy if exists "tables_update_admin" on public.tables;
create policy "tables_update_admin" on public.tables
  for update to authenticated
  using (location_id = public.get_current_location_id() and public.is_admin())
  with check (location_id = public.get_current_location_id() and public.is_admin());

drop policy if exists "tables_delete_admin" on public.tables;
create policy "tables_delete_admin" on public.tables
  for delete to authenticated
  using (location_id = public.get_current_location_id() and public.is_admin());

-- ── location_settings ──────────────────────────────────────
drop policy if exists "location_settings_insert_admin" on public.location_settings;
create policy "location_settings_insert_admin" on public.location_settings
  for insert to authenticated
  with check (location_id = public.get_current_location_id() and public.is_admin());

drop policy if exists "location_settings_update_admin" on public.location_settings;
create policy "location_settings_update_admin" on public.location_settings
  for update to authenticated
  using (location_id = public.get_current_location_id() and public.is_admin())
  with check (location_id = public.get_current_location_id() and public.is_admin());

-- Rollback: re-apply the original policy bodies from 00001, 00003, 00004,
-- 00005, 00009 verbatim (inlined `select role from user_profiles` form).
