// src/components/dashboard/VendorShell.tsx — the vendor's dashboard frame (sidebar with the
// "Needs You" count, and the account block with photo and Sign out). Used by the dashboard
// pages and by /inbox, so Messages opens inside it.
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import AccountBlock from "@/components/dashboard/AccountBlock";
import { removeAvatarAction, signOutAction, uploadAvatarAction } from "@/app/vendor/dashboard/actions";
import { avatarUrl } from "@/lib/actions/avatar";
import { requireVendor } from "@/lib/vendor-session";

export default async function VendorShell({ children }: { children: React.ReactNode }) {
  const { sb, userId } = await requireVendor();
  const [{ count }, { data: profile }, { data: vendor }] = await Promise.all([
    // Decisions waiting on the vendor (RLS: their own).
    sb.from("escalations").select("id", { count: "exact", head: true }).neq("status", "resolved"),
    // Older databases may not have the avatar column yet; fall back to no photo rather than failing.
    sb.from("profiles").select("full_name, email, avatar_path").eq("id", userId).maybeSingle(),
    sb.from("vendors").select("business_name").eq("id", userId).maybeSingle(),
  ]);
  const photo = await avatarUrl(sb, profile?.avatar_path);

  const links = [
    { href: "/vendor/dashboard/needs-you", label: "Needs You", badge: count ?? 0 },
    { href: "/inbox", label: "Messages" },
    { href: "/vendor/dashboard/business", label: "Business" },
    { href: "/vendor/dashboard/portfolio", label: "Portfolio" },
    { href: "/vendor/dashboard/packages", label: "Packages & Add-ons" },
    { href: "/vendor/dashboard/knowledge", label: "Knowledge" },
    { href: "/vendor/dashboard/agent", label: "Agent Settings" },
    { href: "/vendor/dashboard/availability", label: "Availability" },
  ];
  return (
    <DashboardShell
      links={links}
      help="vendor"
      footer={
        <AccountBlock
          name={vendor?.business_name || profile?.full_name || profile?.email || "Your account"}
          avatarUrl={photo}
          uploadAvatarAction={uploadAvatarAction}
          removeAvatarAction={removeAvatarAction}
          signOutAction={signOutAction}
        />
      }
    >
      {children}
    </DashboardShell>
  );
}
