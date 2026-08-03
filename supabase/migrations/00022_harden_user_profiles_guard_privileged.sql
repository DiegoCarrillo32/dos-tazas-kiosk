-- get_advisors flagged user_profiles_guard_privileged() (00021) as directly
-- callable via /rest/v1/rpc/user_profiles_guard_privileged by anon and
-- authenticated — the same class of gap 00017 fixed for
-- get_current_location_id(). It's a trigger function only, never meant to
-- be invoked directly (calling it outside trigger context would error on
-- the missing NEW/OLD record anyway, but there's no reason to expose the
-- attempt). Revoke the implicit PUBLIC grant; trigger firing does not
-- require an EXECUTE grant, only ownership/trigger privileges, so this
-- does not affect the trigger itself (verified against prod).
revoke execute on function public.user_profiles_guard_privileged() from public, anon, authenticated;

-- Rollback:
--   grant execute on function public.user_profiles_guard_privileged() to public;
