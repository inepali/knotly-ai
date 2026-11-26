// src/app/client/dashboard/layout.tsx — the couple's dashboard shell: sidebar + page.
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import CoupleAccount from "@/components/dashboard/CoupleAccount";
import { avatarUrl } from "@/lib/actions/avatar";
import { requireCouple } from "@/lib/couple-session";

export const metadata = { title: "Dashboard · Knotly" };

const links = [
  { href: "/client/dashboard/my-wedding", label: "My Wedding" },
  { href: "/client/dashboard/vendors", label: "Estimates" },
  { href: "/inbox", label: "Messages" }, // the existing inbox, until it moves under the dashboard
  { href: "/client/dashboard/budget", label: "My Budgets" },
];

export default async function CoupleDashboardLayout({ children }: { children: React.ReactNode }) {
  const { sb, userId } = await requireCouple();
  // Older databases may not have the avatar column yet; fall back to no photo rather than failing.
  const { data: profile } = await sb.from("profiles").select("full_name, email, avatar_path").eq("id", userId).maybeSingle();
  const photo = await avatarUrl(sb, profile?.avatar_path);
  return (
    <DashboardShell
      links={links}
      help="couple"
      footer={<CoupleAccount name={profile?.full_name || profile?.email || "Your account"} avatarUrl={photo} />}
    >
      {children}
    </DashboardShell>
  );
}
