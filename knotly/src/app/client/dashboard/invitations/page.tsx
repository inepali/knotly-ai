// Save-the-Dates & Invitations (add-on): design, preview, email to households, print.
import { requireAddon } from "@/lib/addon-access";
import { loadInvitations } from "@/lib/actions/invitations";
import { siteUrl } from "@/lib/site";
import InvitationsEditor from "@/components/invitations/InvitationsEditor";

export default async function InvitationsPage() {
  const { sb, userId } = await requireAddon("invitations");
  const r = await loadInvitations(sb, userId);
  if (!r.ok) return <p className="text-sm text-red-600">{r.error}</p>;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Save-the-Dates & Invitations</h1>
      <p className="mt-1 text-sm text-gray-600">Design once, email every household its own link, and print cards with a QR code.</p>
      <InvitationsEditor data={r.data} baseUrl={siteUrl()} />
    </div>
  );
}
