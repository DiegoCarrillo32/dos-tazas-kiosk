import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import AdminShell from "./_components/AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Same network-tolerant check as app/pos/layout.tsx: a transient failure
  // to reach the Supabase auth server shouldn't log out a real session.
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

  // RBAC: only admins can access. Admin isn't part of the offline-first
  // surface (see the POS floor/counter), so unlike the POS layout above,
  // a role we can't verify safely defaults to "not admin" rather than
  // letting the page through.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role !== "admin") {
    redirect("/pos/floor");
  }

  return <AdminShell>{children}</AdminShell>;
}
