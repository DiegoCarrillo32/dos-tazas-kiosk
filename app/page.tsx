import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Both admins and staff land on the POS floor; admins can open the
  // Admin portal from the nav. No role lookup needed for this redirect.
  redirect("/pos/floor");
}
