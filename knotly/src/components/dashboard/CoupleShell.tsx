// src/components/dashboard/CoupleShell.tsx — the couple's dashboard frame (sidebar + account block).
// Used by the dashboard pages and by /inbox, so Messages opens inside the same layout.
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import AccountBlock from "@/components/dashboard/AccountBlock";
import { removeAvatarAction, signOutAction, uploadAvatarAction } from "@/app/client/dashboard/actions";
import { avatarUrl } from "@/lib/actions/avatar";
import { requireCouple } from "@/lib/couple-session";

const PLANNING = [
  { href: "/client/dashboard/my-wedding", label: "My Wedding" },
  { href: "/client/dashboard/vendors", label: "Estimates" },
  { href: "/inbox", label: "Messages" },
  { href: "/client/dashboard/budget", label: "Budget" },
  { href: "/client/dashboard/guests", label: "Guest List" },
];
// Paid add-ons (one-time, per wedding). Locked ones open their preview page.
const ADDON_LINKS: { href: string; label: string; key: string }[] = [
  { href: "/client/dashboard/website", label: "Website", key: "website" },
  { href: "/client/dashboard/rsvp", label: "RSVP", key: "rsvp" },
  { href: "/client/dashboard/registry", label: "Registry", key: "registry" },
  { href: "/client/dashboard/invitations", label: "Invitations", key: "invitations" },
  { href: "/client/dashboard/seating", label: "Seating", key: "seating" },
  { href: "/client/dashboard/photos", label: "Photos", key: "photo_share" },
  { href: "/client/dashboard/thank-you", label: "Thank-Yous", key: "thank_you" },
];

export default async function CoupleShell({ children }: { children: React.ReactNode }) {
  const { sb, userId } = await requireCouple();
  // Older databases may not have the avatar column yet; fall back to no photo rather than failing.
  const { data: profile } = await sb.from("profiles").select("full_name, email, avatar_path").eq("id", userId).maybeSingle();
  const photo = await avatarUrl(sb, profile?.avatar_path);
  // Which add-ons this wedding has (RLS: their own). Expired ones stay readable, so they aren't locked.
  const { data: owned } = await sb.from("couple_addons").select("addon_key");
  const have = new Set((owned ?? []).map((o) => o.addon_key as string));
  const links = [
    ...PLANNING,
    ...ADDON_LINKS.map((l) => ({ href: l.href, label: l.label, section: "Wedding add-ons", locked: !have.has(l.key) })),
    { href: "/client/dashboard/add-ons", label: "All add-ons", section: "Wedding add-ons" },
  ];
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
