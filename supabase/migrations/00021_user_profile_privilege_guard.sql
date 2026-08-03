-- ============================================================
-- Phase 0 security hotfix — user_profiles self-escalation guard
-- ============================================================
--
-- user_profiles_update_own (00001_initial_schema.sql) has
-- `using (id = auth.uid())` and NO `with check`. Postgres reuses USING
-- as the check when one isn't given, and the post-update row still
-- satisfies `id = auth.uid()` no matter what else changed. That means
-- any authenticated staff member can currently run, via PostgREST:
--
--   update user_profiles set role = 'admin' where id = auth.uid();
--   update user_profiles set location_id = '<any-uuid>' where id = auth.uid();
--
-- ...and self-promote to admin, or hop to another tenant's location_id
-- and inherit read/write access to that tenant's entire database via
-- get_current_location_id(). RLS cannot express column-level
-- restrictions, and column-level GRANTs would break the staff
-- invite/promote-demote upsert paths, so a BEFORE UPDATE trigger is
-- the minimal correct fix: block changes to `role` or `location_id`
-- unless the caller is an admin acting on someone else.

create or replace function public.user_profiles_guard_privileged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     or new.location_id is distinct from old.location_id then
    -- auth.uid() is null for service_role / dashboard / internal
    -- SECURITY DEFINER call paths — those are trusted and unaffected.
    if auth.uid() is not null then
      if new.id = auth.uid() then
        raise exception 'You cannot change your own role or location';
      end if;
      if not public.is_admin() then
        raise exception 'Only an admin can change a user''s role or location';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_guard_privileged on public.user_profiles;
create trigger user_profiles_guard_privileged
  before update on public.user_profiles
  for each row
  execute function public.user_profiles_guard_privileged();

-- Rollback:
--   drop trigger user_profiles_guard_privileged on public.user_profiles;
--   drop function public.user_profiles_guard_privileged();
