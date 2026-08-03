import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getLandingPath, LANDING_COOKIE } from "@/lib/landing";

export default async function Home() {
  const supabase = await createClient();

  // Same network-tolerant check as app/admin/layout.tsx: a transient
  // failure to reach the Supabase auth server shouldn't log out a real
  // session.
  let userId: string | null = null;
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
    } else if (error) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      userId = session?.user.id ?? null;
    }
  } catch {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    userId = session?.user.id ?? null;
  }

  if (!userId) {
    redirect("/login");
  }

  // Admins land on the dashboard, staff on the POS floor — unless an
  // admin has set a sticky "go straight to the till" preference in
  // /admin/settings. A failed role read defaults to staff-like ("/pos/floor"),
  // matching the fail-open posture of app/pos/layout.tsx's isAdmin.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const landingPref = (await cookies()).get(LANDING_COOKIE)?.value;
  redirect(getLandingPath(profile?.role, landingPref));
}
