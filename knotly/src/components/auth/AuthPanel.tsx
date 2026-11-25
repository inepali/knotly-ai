// src/components/auth/AuthPanel.tsx — the sign-up / sign-in form on its own page.
// It wraps AccountForm (which talks to /api/auth/*) and sends the person to their home once they're in.
"use client";
import { useRouter } from "next/navigation";
import AccountForm from "./AccountForm";
import { homeFor } from "@/lib/auth";

export function AuthPanel({
  mode,
  role,
}: {
  mode: "signup" | "signin";
  role?: "couple" | "vendor";
}) {
  const router = useRouter();
  return (
    <AccountForm
      initialMode={mode}
      initialRole={role}
      reason={
        mode === "signup"
          ? "Choose what you're here to do, then add your email or phone."
          : "Welcome back. Sign in to pick up where you left off."
      }
      onDone={(signedInAs) => {
        router.push(homeFor(signedInAs));
        router.refresh();
      }}
    />
  );
}
