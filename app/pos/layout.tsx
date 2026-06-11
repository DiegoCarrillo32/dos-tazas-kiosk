import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import POSNav from "./_components/POSNav";

export default async function POSLayout({
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

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  return <POSNav isAdmin={isAdmin}>{children}</POSNav>;
}
