/**
 * Where a user lands after authenticating (both a fresh login and any
 * visit to "/"). Kept as a small pure function, separate from the auth
 * lookup that feeds it, so a later change to how role is resolved (e.g.
 * Phase 2's `session_context()` RPC replacing a plain `user_profiles.role`
 * read) only touches the caller — this logic doesn't move.
 */

/** Cookie holding an admin's sticky landing preference: "admin" | "pos". */
export const LANDING_COOKIE = "landing";

/** One year, in seconds — same rationale as the language cookie (LANG_MAX_AGE). */
export const LANDING_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function getLandingPath(
  role: string | null | undefined,
  landingPref: string | undefined
): string {
  const isAdmin = role === "admin";
  // Staff always land on the floor — the landing preference only exists
  // for admins choosing between the dashboard and going straight to the till.
  if (isAdmin && landingPref !== "pos") {
    return "/admin";
  }
  return "/pos/floor";
}
