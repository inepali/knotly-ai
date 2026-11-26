// The link shown in the on-screen preview (a sample, not a real household's personal link).
import type { InvitationsData } from "@/lib/actions/invitations";
import type { Kind } from "@/lib/invitations";

export function cardLinkPreview(d: Pick<InvitationsData, "site" | "rsvp">, kind: Kind, baseUrl: string) {
  if (!d.site) return baseUrl;
  return `${baseUrl}/w/${d.site.slug}${kind === "invitation" && d.rsvp ? "/rsvp" : ""}`;
}
