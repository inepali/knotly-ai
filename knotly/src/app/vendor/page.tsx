// src/app/vendor/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import Chat from "@/components/chat/Chat";

export default async function VendorPage() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/vendor/login");
  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "vendor") redirect("/vendor/login");
  return <Chat guest={false} />;
}
