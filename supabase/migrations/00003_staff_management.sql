-- ============================================================
-- Staff Management - RLS & Support
-- Run AFTER 00001_initial_schema.sql
-- ============================================================

-- Allow admins to insert new user profiles (staff invite)
create policy "admin_insert_user_profiles" on public.user_profiles
  for insert to authenticated
  with check (
    location_id = public.get_current_location_id()
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );

-- Allow admins to update user profiles in their location (role changes)
create policy "admin_update_user_profiles" on public.user_profiles
  for update to authenticated
  using (
    location_id = public.get_current_location_id()
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );

-- Allow admins to delete user profiles (remove staff)
create policy "admin_delete_user_profiles" on public.user_profiles
  for delete to authenticated
  using (
    location_id = public.get_current_location_id()
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
    and id != auth.uid()  -- prevent self-deletion
  );
