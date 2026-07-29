import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv } from "./env";

export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}

/**
 * A Supabase client that never reads or writes the browser's stored
 * session. Used for exactly one thing: `auth.signUp` when an admin
 * invites a new staff member (see `inviteStaffMember` in lib/queries.ts).
 * Calling `signUp` on the ADMIN's own client would sign the browser in
 * as the brand-new staff account the instant it's created, replacing the
 * admin's session mid-task.
 */
export function createEphemeralClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: "dostazas.ephemeral",
    },
  });
}
