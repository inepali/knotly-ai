// src/app/(auth)/signin/page.tsx — one sign-in for couples, vendors and admins.
// /signin?next=/wedding-vendors/… brings a couple back to the vendor page they were chatting on.
import type { Metadata } from "next";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { safeReturnPath } from "@/lib/public-chat";

export const metadata: Metadata = { title: "Sign in · Knotly" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return <AuthPanel mode="signin" coupleNext={safeReturnPath(Array.isArray(next) ? next[0] : next) ?? undefined} />;
}
