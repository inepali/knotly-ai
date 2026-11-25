// src/app/vendor/dashboard/layout.tsx — the vendor's dashboard shell: sidebar + page.
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { requireVendor } from "@/lib/vendor-session";

export const metadata = { title: "Vendor dashboard · Knotly" };

export default async function VendorDashboardLayout({ children }: { children: React.ReactNode }) {
  const { sb } = await requireVendor();
  // Decisions waiting on the vendor (RLS: their own).
  const { count } = await sb
    .from("escalations")
    .select("id", { count: "exact", head: true })
    .neq("status", "resolved");

  const links = [
    { href: "/vendor/dashboard/needs-you", label: "Needs You", badge: count ?? 0 },
    { href: "/inbox", label: "Messages" }, // the existing inbox, until it moves under the dashboard
    { href: "/vendor/dashboard/business", label: "Business" },
    { href: "/vendor/dashboard/packages", label: "Packages & Add-ons" },
    { href: "/vendor/dashboard/knowledge", label: "Knowledge" },
    { href: "/vendor/dashboard/agent", label: "Agent Settings" },
    { href: "/vendor/dashboard/availability", label: "Availability" },
  ];
  return <DashboardShell links={links}>{children}</DashboardShell>;
}
