-- ============================================================
-- Fix: user_profiles_active_location_is_membership's ON DELETE SET NULL
-- ============================================================
-- Discovered by testing remove_location_membership against prod: the
-- composite FK is (id, active_location_id) REFERENCES
-- location_members(user_id, location_id). Because `id` is itself one of
-- the FK's columns, "ON DELETE SET NULL" tries to null BOTH columns when
-- the referenced membership row is deleted — including `id`, which is
-- user_profiles' own NOT NULL primary key. That raised a real constraint
-- violation on the first membership removal:
--
--   ERROR: 23502: null value in column "id" of relation "user_profiles"
--   violates not-null constraint
--
-- Fix: drop the SET NULL action (falls back to NO ACTION), and have
-- remove_location_membership explicitly null active_location_id BEFORE
-- deleting the membership row, only if it currently points there. A NULL
-- active_location_id trivially satisfies the composite FK (MATCH SIMPLE —
-- the default — doesn't enforce the constraint when any column is NULL),
-- so the delete then proceeds unconstrained. Verified against prod:
-- active_location_id nulls correctly, membership row is removed, no
-- constraint violation; get_current_location_id()'s existing fallback
-- (order by created_at, location_id) resolves the user's next remaining
-- membership on their next call.

alter table public.user_profiles
  drop constraint user_profiles_active_location_is_membership;
alter table public.user_profiles
  add constraint user_profiles_active_location_is_membership
  foreign key (id, active_location_id)
  references public.location_members (user_id, location_id);

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

  -- See migration header: null the pointer first so the composite FK
  -- doesn't need to (and can't safely) do it via ON DELETE SET NULL.
  update public.user_profiles
     set active_location_id = null
   where id = p_user_id and active_location_id = p_location_id;

  delete from public.location_members
    where user_id = p_user_id and location_id = p_location_id;
end;
$$;

-- Rollback:
--   alter table public.user_profiles drop constraint user_profiles_active_location_is_membership;
--   alter table public.user_profiles add constraint user_profiles_active_location_is_membership
--     foreign key (id, active_location_id) references public.location_members (user_id, location_id) on delete set null;
--   -- (restore the pre-fix remove_location_membership body from 00026)
