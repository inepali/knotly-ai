// src/app/(auth)/signup/page.tsx — choose Couple or Wedding vendor, then create the account.
// /signup?role=vendor preselects the vendor choice. The role is saved by /api/auth/verify.
// /signup?role=couple&metro=charlotte-nc&need=photographer (from the public listing pages) sends a
// new couple to My Wedding with that city and vendor type filled in.
import type { Metadata } from "next";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { weddingPrefillPath } from "@/lib/listing";

export const metadata: Metadata = { title: "Create your account · Knotly" };

type Param = string | string[] | undefined;
const one = (p: Param) => (Array.isArray(p) ? p[0] : p);

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: Param; metro?: Param; need?: Param }>;
}) {
  const { role, metro, need } = await searchParams;
  return (
    <AuthPanel
      mode="signup"
      role={one(role) === "vendor" ? "vendor" : "couple"}
      coupleNext={weddingPrefillPath(one(metro), one(need)) ?? undefined}
    />
  );
}
