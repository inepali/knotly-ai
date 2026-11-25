// src/app/(auth)/signup/page.tsx — choose Couple or Wedding vendor, then create the account.
// /signup?role=vendor preselects the vendor choice. The role is saved by /api/auth/verify.
import type { Metadata } from "next";
import { AuthPanel } from "@/components/auth/AuthPanel";

export const metadata: Metadata = { title: "Create your account · Knotly" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string | string[] }>;
}) {
  const { role } = await searchParams;
  return <AuthPanel mode="signup" role={role === "vendor" ? "vendor" : "couple"} />;
}
