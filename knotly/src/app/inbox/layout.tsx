// src/app/inbox/layout.tsx — Messages open inside the signed-in person's own dashboard (couple or
// vendor), in the main content area, instead of in a separate page frame. The /inbox URLs stay
// the same, so links in emails and help keep working.
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getViewer } from "@/lib/mailbox";
import CoupleShell from "@/components/dashboard/CoupleShell";
import VendorShell from "@/components/dashboard/VendorShell";

export const metadata = { title: "Messages · Knotly" };

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer(await supabaseServer());
  if (!viewer) redirect("/signin");
  return viewer.side === "vendor" ? <VendorShell>{children}</VendorShell> : <CoupleShell>{children}</CoupleShell>;
}
