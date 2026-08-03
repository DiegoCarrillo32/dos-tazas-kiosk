-- ============================================================
-- Phase 2, Stage B — membership helpers + redefine the linchpin
-- ============================================================
-- get_current_location_id() and is_admin() are the two functions every
-- RLS policy and every RPC in the schema is expressed through. Redefining
-- them here is what activates location_members/active_location_id for
-- every existing policy/RPC with no further change to any of them.
--
-- With exactly one location and every user a member of it (Stage A's
-- backfill), get_current_location_id() must return byte-identical results
-- to before this migration — that is this stage's entire correctness bar,
-- and it was verified against prod (both real profiles) before this file
-- was written.

create or replace function public.is_member_of(p_location_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.location_members
                  where user_id = auth.uid() and location_id = p_location_id);
$$;

create or replace function public.is_admin_at(p_location_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.location_members
                  where user_id = auth.uid() and location_id = p_location_id
                    and role = 'admin');
$$;

create or replace function public.shares_location_with(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.location_members lm
                  where lm.user_id = p_user_id
                    and lm.location_id = public.get_current_location_id());
$$;

revoke execute on function
  public.is_member_of(uuid), public.is_admin_at(uuid), public.shares_location_with(uuid)
  from public, anon;
grant execute on function
  public.is_member_of(uuid), public.is_admin_at(uuid), public.shares_location_with(uuid)
  to authenticated, service_role;

-- THE linchpin. Returns active_location_id joined against location_members
-- (so a value that isn't a real membership is inert, on top of the
-- composite FK from Stage A making it structurally impossible), falling
-- back to the caller's first membership by (created_at, location_id) for
-- a deterministic total order — this only matters for a user whose
-- active_location_id is null, which cannot happen today (Stage A backfilled
-- it) but will happen for brand-new members provisioned later.
create or replace function public.get_current_location_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select up.active_location_id
       from public.user_profiles up
       join public.location_members lm
         on lm.user_id = up.id and lm.location_id = up.active_location_id
      where up.id = auth.uid()),
    (select lm.location_id from public.location_members lm
      where lm.user_id = auth.uid()
      order by lm.created_at, lm.location_id
      limit 1)
  );
$$;

revoke execute on function public.get_current_location_id() from public, anon;
grant execute on function public.get_current_location_id() to authenticated, service_role;

-- is_admin() now means "admin at the ACTIVE location" via membership,
-- replacing the old `role = 'admin'` column read. This is a deliberate
-- tightening once switching exists (Phase 3): an admin at location A who
-- switches to a location where they're staff loses admin powers there.
-- With one location today, behavior is unchanged.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.is_admin_at(public.get_current_location_id()), false);
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- Rollback:
--   -- restore the pre-Stage-B bodies (see 00001, 00013, 00017):
--   create or replace function public.get_current_location_id() returns uuid
--     language sql security definer stable set search_path = public as $$
--       select location_id from public.user_profiles where id = auth.uid();
--     $$;
--   create or replace function public.is_admin() returns boolean
--     language sql security definer stable set search_path = public as $$
--       select role = 'admin' from public.user_profiles where id = auth.uid();
--     $$;
--   drop function public.is_member_of(uuid);
--   drop function public.is_admin_at(uuid);
--   drop function public.shares_location_with(uuid);
