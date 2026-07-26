-- get_current_location_id is the linchpin of every RLS policy in this schema
-- (`location_id = public.get_current_location_id()`), but it was the only
-- SECURITY DEFINER function here left without a pinned search_path — so a
-- role able to create objects in an earlier schema could shadow
-- `public.user_profiles` and have the definer resolve to their table,
-- handing them another location's rows. Every other function in the schema
-- already pins it; this brings the most privileged one in line.
--
-- It was also left executable by `anon` (via the implicit grant to PUBLIC),
-- exposing /rest/v1/rpc/get_current_location_id to unauthenticated callers.
-- It returns null for them, but there is no reason to publish it.

create or replace function public.get_current_location_id()
returns uuid
language sql security definer stable
set search_path = public
as $$
  select location_id from public.user_profiles where id = auth.uid();
$$;

revoke execute on function public.get_current_location_id() from public, anon;
grant execute on function public.get_current_location_id() to authenticated, service_role;
