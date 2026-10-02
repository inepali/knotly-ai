// src/app/vendor/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import Chat from "@/components/chat/Chat";

// Vendor home. Signing in happens in the shared chat flow; anyone who isn't a
// signed-in vendor is sent there. Chat picks the vendor tools and UI from the role.
export default async function VendorPage() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.is_anonymous) redirect("/chat");
  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "vendor") redirect("/chat");
  return <Chat />;
}
