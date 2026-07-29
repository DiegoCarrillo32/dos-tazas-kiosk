import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() re-validates against the Supabase auth server on every
  // request. That's the right check when it succeeds, but a network
  // hiccup (kiosk wifi, a Supabase incident) makes it fail even for a
  // genuinely logged-in staff member — and unlike loading cached menu
  // data, being kicked to /login mid-shift stops the till outright. Fall
  // back to getSession(), a pure cookie read with no network call, so a
  // real session survives Supabase being briefly unreachable. Every
  // actual data access still carries the JWT to PostgREST, where RLS is
  // the real authorization boundary — this check only decides whether to
  // redirect, never what a request is allowed to see.
  let authed = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (data.user) {
      authed = true;
    } else if (error) {
      const { data: sessionData } = await supabase.auth.getSession();
      authed = !!sessionData.session;
    }
  } catch {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      authed = !!sessionData.session;
    } catch {
      authed = false;
    }
  }

  if (
    !authed &&
    !request.nextUrl.pathname.startsWith('/login') &&
    request.nextUrl.pathname !== '/' &&
    // /offline is the service worker's navigation fallback (public/sw.js)
    // — a public, static page by design so it works with no session and
    // no network. Redirecting it to /login would get followed and cached
    // under the /offline key during the SW's install-time precache,
    // silently replacing the offline message with the login page.
    request.nextUrl.pathname !== '/offline'
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
