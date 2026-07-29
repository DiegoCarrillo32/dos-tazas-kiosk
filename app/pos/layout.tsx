import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import POSNav from "./_components/POSNav";

export default async function POSLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // getUser() hits the Supabase auth server; if that's briefly unreachable
  // (kiosk wifi, a Supabase incident) fall back to the session already in
  // the request's cookies rather than bouncing a genuinely logged-in
  // staff member to /login. RLS still governs every actual data access.
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

  // A transient failure here shouldn't 500 the whole POS — default to
  // non-admin rather than crash; the nav just hides admin-only links.
  let isAdmin = false;
  try {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", userId)
      .single();
    isAdmin = profile?.role === "admin";
  } catch {
    // already false
  }

  return <POSNav isAdmin={isAdmin}>{children}</POSNav>;
}
