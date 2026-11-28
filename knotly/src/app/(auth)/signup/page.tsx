// src/app/(auth)/signup/page.tsx — choose Couple or Wedding vendor, then create the account.
// /signup?role=vendor preselects the vendor choice. The role is saved by /api/auth/verify.
// /signup?role=couple&metro=charlotte-nc&need=photographer (from the public listing pages) sends a
// new couple to My Wedding with that city and vendor type filled in.
// /signup?role=couple&next=/wedding-vendors/… (from "Save this conversation" in a vendor's chat)
// brings the couple back to that vendor's page; the chat itself is claimed by /api/auth/verify.
import type { Metadata } from "next";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { weddingPrefillPath } from "@/lib/listing";
import { safeReturnPath } from "@/lib/public-chat";

export const metadata: Metadata = { title: "Create your account · Knotly" };

type Param = string | string[] | undefined;
const one = (p: Param) => (Array.isArray(p) ? p[0] : p);

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: Param; metro?: Param; need?: Param; next?: Param }>;
}) {
  const { role, metro, need, next } = await searchParams;
  return (
    <AuthPanel
      mode="signup"
      role={one(role) === "vendor" ? "vendor" : "couple"}
      coupleNext={safeReturnPath(one(next)) ?? weddingPrefillPath(one(metro), one(need)) ?? undefined}
    />
  );
}
