-- ============================================================
-- Fix: provision_staff_member's insert order violated the composite FK
-- ============================================================
-- user_profiles_active_location_is_membership is (id, active_location_id)
-- REFERENCES location_members(user_id, location_id). location_members.user_id
-- itself REFERENCES user_profiles.id. That's a circular dependency between
-- the two rows this function creates: user_profiles can't be inserted with
-- a non-null active_location_id before its location_members row exists,
-- and location_members can't be inserted before user_profiles exists.
--
-- The only way through: insert user_profiles with active_location_id NULL
-- (satisfies the composite FK trivially — MATCH SIMPLE doesn't enforce it
-- when any column is NULL), insert location_members (now user_profiles.id
-- exists), then backfill active_location_id (now the location_members row
-- exists too). Reported live: inviting a new staff member raised
-- "violates foreign key constraint user_profiles_active_location_is_membership"
-- after the auth account was already created — this is the fix, and the
-- documented recovery (re-invite the same email) completes cleanly once
-- this is live, since auth.signUp is idempotent for an unconfirmed email.
--
-- Verified against prod (rolled back): a real end-to-end
-- provision_staff_member call — fresh auth user, real admin JWT — now
-- creates the profile, the membership, and the correct active_location_id
-- with no FK violation.

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
    values (p_user_id, v_loc, p_role, p_first_name, nullif(p_last_name,''), null);

  insert into public.location_members (user_id, location_id, role)
    values (p_user_id, v_loc, p_role);

  update public.user_profiles set active_location_id = v_loc where id = p_user_id;
end;
$$;

-- Rollback: restore the pre-fix body (see 00026) — not recommended, the
-- pre-fix body is the bug being fixed here.
