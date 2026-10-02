// src/app/vendor/login/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function VendorLogin() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  return (
    <main className="mx-auto max-w-sm space-y-3 p-8">
      <h1 className="text-2xl font-semibold">Knotly for vendors</h1>
      {!sent ? (
        <>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            className="w-full rounded border px-3 py-2"
          />
          <button
            className="rounded bg-black px-4 py-2 text-white"
            onClick={async () => {
              await sb.auth.signOut(); // drop any guest session
              const { error } = await sb.auth.signInWithOtp({
                email,
                options: { shouldCreateUser: true, data: { role: "vendor" } },
              });
              error ? setError(error.message) : setSent(true);
            }}
          >
            Email me a code
          </button>
        </>
      ) : (
        <>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            className="w-full rounded border px-3 py-2 tracking-widest"
          />
          <button
            className="rounded bg-black px-4 py-2 text-white"
            onClick={async () => {
              const { error } = await sb.auth.verifyOtp({
                email,
                token: code,
                type: "email",
              });
              error
                ? setError("That code didn't work")
                : router.push("/vendor");
            }}
          >
            Sign in
          </button>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
