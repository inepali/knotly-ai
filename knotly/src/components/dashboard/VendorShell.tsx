// src/components/dashboard/VendorShell.tsx — the vendor's dashboard frame (sidebar with the
// "Needs You" count). Used by the dashboard pages and by /inbox, so Messages opens inside it.
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { requireVendor } from "@/lib/vendor-session";

export default async function VendorShell({ children }: { children: React.ReactNode }) {
  const { sb } = await requireVendor();
  // Decisions waiting on the vendor (RLS: their own).
  const { count } = await sb
    .from("escalations")
    .select("id", { count: "exact", head: true })
    .neq("status", "resolved");

  const links = [
    { href: "/vendor/dashboard/needs-you", label: "Needs You", badge: count ?? 0 },
    { href: "/inbox", label: "Messages" },
    { href: "/vendor/dashboard/business", label: "Business" },
    { href: "/vendor/dashboard/packages", label: "Packages & Add-ons" },
    { href: "/vendor/dashboard/knowledge", label: "Knowledge" },
    { href: "/vendor/dashboard/agent", label: "Agent Settings" },
    { href: "/vendor/dashboard/availability", label: "Availability" },
  ];
  return (
    <DashboardShell links={links} help="vendor">
      {children}
    </DashboardShell>
  );
}
