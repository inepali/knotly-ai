// src/components/website/SitePasswordGate.tsx — "This site is private" form.
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unlockSiteAction } from "@/app/w/[slug]/actions";
import type { ThemeKey } from "@/lib/wedding-site";
import { themeStyle } from "./theme";

export default function SitePasswordGate({ slug, title, theme }: { slug: string; title: string; theme: ThemeKey }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <main style={themeStyle(theme)} className="flex min-h-dvh items-center justify-center px-6">
      <form
        className="w-full max-w-sm text-center"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          start(async () => {
            const r = await unlockSiteAction(slug, pw);
            if (r.ok) router.refresh();
            else setError(r.error ?? "Try again.");
          });
        }}
      >
        <h1 className="text-3xl">{title}</h1>
        <p className="mt-3 text-sm opacity-80">This site is private. Enter the password from your invitation.</p>
        <input
          type="password"
          aria-label="Password"
          autoComplete="current-password"
          className="mt-6 w-full rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-gray-900"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <button
          type="submit"
          disabled={pending || !pw}
          className="mt-3 w-full rounded-lg px-3 py-2 font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--ws-accent)" }}
        >
          {pending ? "Checking…" : "Enter"}
        </button>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
