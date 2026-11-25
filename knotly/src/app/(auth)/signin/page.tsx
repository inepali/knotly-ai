// src/app/(auth)/signin/page.tsx — one sign-in for couples, vendors and admins.
import type { Metadata } from "next";
import { AuthPanel } from "@/components/auth/AuthPanel";

export const metadata: Metadata = { title: "Sign in · Knotly" };

export default function SignInPage() {
  return <AuthPanel mode="signin" />;
}
