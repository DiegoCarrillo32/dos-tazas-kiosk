import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import AdminShell from "./_components/AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // RBAC: only admins can access
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/pos/floor");
  }

  return <AdminShell>{children}</AdminShell>;
}
