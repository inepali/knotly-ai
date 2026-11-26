// src/components/rsvp/RsvpFinder.tsx — "Find your invitation" by name (and code, if the couple asks for one).
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { findRsvpAction } from "@/app/w/[slug]/rsvp/actions";

const field = "w-full rounded-lg border border-black/10 bg-white/90 px-3 py-2 text-gray-900";

export default function RsvpFinder({ slug, requireCode, invalidLink }: { slug: string; requireCode: boolean; invalidLink: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState(invalidLink ? "That link didn't work. Find your invitation below." : "");
  const [matches, setMatches] = useState<{ token: string; label: string }[]>([]);
  const [pending, start] = useTransition();
  const go = (token: string) => router.push(`/w/${slug}/rsvp?t=${token}`);

  return (
    <form
      className="mt-10 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        setMatches([]);
        start(async () => {
          const r = await findRsvpAction(slug, name, code);
          if (!r.ok) return setError(r.error);
          if (r.matches.length === 1) go(r.matches[0].token);
          else setMatches(r.matches);
        });
      }}
    >
      <p className="text-center">Find your invitation</p>
      <input aria-label="Your first and last name" placeholder="First and last name" autoComplete="name" className={field} value={name} onChange={(e) => setName(e.target.value)} />
      {requireCode && (
        <input aria-label="Invitation code" placeholder="Code from your invitation" autoComplete="off" className={`${field} uppercase`} value={code} onChange={(e) => setCode(e.target.value)} />
      )}
      <button type="submit" disabled={pending || name.trim().split(/\s+/).length < 2} className="w-full rounded-lg px-3 py-2 font-semibold text-white disabled:opacity-50" style={{ background: "var(--ws-accent)" }}>
        {pending ? "Looking…" : "Find my invitation"}
      </button>
      {error && <p role="alert" className="text-center text-sm text-red-600">{error}</p>}
      {matches.length > 1 && (
        <ul className="space-y-2">
          <li className="text-center text-sm opacity-80">Which one is you?</li>
          {matches.map((m) => (
            <li key={m.token}>
              <button type="button" onClick={() => go(m.token)} className="w-full rounded-lg border border-black/10 px-3 py-2" style={{ background: "var(--ws-soft)" }}>
                {m.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
