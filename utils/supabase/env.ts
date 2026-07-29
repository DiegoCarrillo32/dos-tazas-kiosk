/**
 * Reads and validates the two Supabase env vars every client factory in
 * this directory needs. Without this, a missing var surfaced as `undefined`
 * threaded through to `createBrowserClient`/`createServerClient` — which
 * either throws deep inside `@supabase/ssr` or, worse, builds a client
 * pointed at "https://undefined" that fails opaquely on the first request.
 * Failing loudly here, once, at the call site instead is a much shorter
 * path from "the app won't start" to "here's the .env line to fix" — see
 * .env.example for the two keys this expects.
 */
export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Missing required env var(s): ${missing.join(", ")}. Copy .env.example to .env (or .env.local) and fill in your Supabase project's URL and anon key.`
    );
  }

  return { url, anonKey } as { url: string; anonKey: string };
}
