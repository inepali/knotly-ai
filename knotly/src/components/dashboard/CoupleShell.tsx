// src/components/dashboard/CoupleShell.tsx — the couple's dashboard frame (sidebar + account block).
// Used by the dashboard pages and by /inbox, so Messages opens inside the same layout.
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import AccountBlock from "@/components/dashboard/AccountBlock";
import { removeAvatarAction, signOutAction, uploadAvatarAction } from "@/app/client/dashboard/actions";
import { avatarUrl } from "@/lib/actions/avatar";
import { requireCouple } from "@/lib/couple-session";

const links = [
  { href: "/client/dashboard/my-wedding", label: "My Wedding" },
  { href: "/client/dashboard/vendors", label: "Estimates" },
  { href: "/inbox", label: "Messages" },
  { href: "/client/dashboard/budget", label: "My Budgets" },
  { href: "/client/dashboard/guests", label: "Guest List" },
  { href: "/client/dashboard/website", label: "Website" },
  { href: "/client/dashboard/rsvp", label: "RSVP" },
  { href: "/client/dashboard/registry", label: "Registry" },
  { href: "/client/dashboard/invitations", label: "Invitations" },
  { href: "/client/dashboard/add-ons", label: "Add-ons" },
];

export default async function CoupleShell({ children }: { children: React.ReactNode }) {
  const { sb, userId } = await requireCouple();
  // Older databases may not have the avatar column yet; fall back to no photo rather than failing.
  const { data: profile } = await sb.from("profiles").select("full_name, email, avatar_path").eq("id", userId).maybeSingle();
  const photo = await avatarUrl(sb, profile?.avatar_path);
  return (
    <DashboardShell
      links={links}
      help="couple"
      footer={
        <AccountBlock
          name={profile?.full_name || profile?.email || "Your account"}
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
