// src/components/chat/cards/AccountCard.tsx
"use client";
import { useState } from "react";

type Mode = "signup" | "code" | "signin" | "done";
type Method = "email" | "phone";

// Remembered so a later visit (signed out, same browser) is offered sign-in, not sign-up.
export const HAS_ACCOUNT_KEY = "knotly:has-account";

export default function AccountCard({
  initialMode,
  reason,
  onDone,
}: {
  initialMode: "signup" | "signin";
  reason: string;
  onDone: (msg: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [method, setMethod] = useState<Method>("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: object) {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, identifier: identifier.trim(), ...body }),
      });
      const json = await res.json().catch(() => ({ ok: false, error: "Something went wrong." }));
      if (!json.ok) setError(json.error ?? "Something went wrong.");
      return json;
    } finally {
      setBusy(false);
    }
  }

  function finish(msg: string) {
    try {
      localStorage.setItem(HAS_ACCOUNT_KEY, "1");
    } catch {}
    setMode("done");
    onDone(msg);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup") {
      if (password.length < 8) return setError("Use at least 8 characters for your password.");
      if (!terms) return setError("Please accept the terms.");
      const r = await post("/api/auth/signup", {});
      if (r.ok) setMode("code");
      else if (r.exists) {
        setMode("signin");
        setPassword("");
        setNotice("Looks like you already have an account. Sign in to continue.");
        setError("");
      }
    } else if (mode === "code") {
      const r = await post("/api/auth/verify", { code: code.trim(), password, acceptedTerms: terms });
      if (r.ok) finish("I created my account.");
    } else if (mode === "signin") {
      const r = await post("/api/auth/signin", { password });
      if (r.ok)
        finish(
          r.conflicts?.length
            ? `I signed in. My saved plan differs from what I said today: ${JSON.stringify(r.conflicts)}`
            : "I signed in."
        );
    }
  }

  if (mode === "done")
    return <p className="text-sm text-emerald-700 dark:text-emerald-400">✓ You&apos;re signed in</p>;

  const field =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950";
  const tab = (m: Method) =>
    `flex-1 rounded-md px-3 py-1 text-sm ${
      method === m ? "bg-black text-white dark:bg-white dark:text-black" : "text-gray-600 dark:text-gray-400"
    }`;

  return (
    <form
      onSubmit={submit}
      className="my-2 max-w-sm space-y-3 rounded-xl border border-gray-300 p-4 text-left dark:border-gray-700"
    >
      <p className="font-medium">
        {mode === "signin" ? "Sign in to Knotly" : mode === "code" ? "Check your " + (method === "email" ? "email" : "phone") : "Create your Knotly account"}
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400">{notice || reason}</p>

      {mode === "code" ? (
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={10}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={`Code sent to ${identifier}`}
          className={`${field} tracking-widest`}
          autoFocus
        />
      ) : (
        <>
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
            <button type="button" className={tab("email")} onClick={() => setMethod("email")}>
              Email
            </button>
            <button type="button" className={tab("phone")} onClick={() => setMethod("phone")}>
              Phone
            </button>
          </div>
          <input
            type={method === "email" ? "email" : "tel"}
            autoComplete={method === "email" ? "email" : "tel"}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={method === "email" ? "you@example.com" : "+17045551234"}
            className={field}
            required
          />
          <input
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signin" ? "Password" : "Password (8+ characters)"}
            className={field}
            required
          />
          {mode === "signup" && (
            <label className="flex gap-2 text-xs text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              I agree to Knotly&apos;s Terms and Privacy Policy, including AI-assisted messaging.
            </label>
          )}
        </>
      )}

      <button
        disabled={busy}
        className="w-full rounded-lg bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "code" ? "Verify and finish" : "Create account"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-xs text-gray-500">
        {mode === "signin" ? (
          <>
            New to Knotly?{" "}
            <button type="button" className="underline" onClick={() => { setMode("signup"); setNotice(""); setError(""); }}>
              Create an account
            </button>
          </>
        ) : mode === "signup" ? (
          <>
            Already have an account?{" "}
            <button type="button" className="underline" onClick={() => { setMode("signin"); setNotice(""); setError(""); }}>
              Sign in
            </button>
          </>
        ) : (
          <>
            Wrong {method}?{" "}
            <button type="button" className="underline" onClick={() => { setMode("signup"); setCode(""); setError(""); }}>
              Go back
            </button>
          </>
        )}
      </p>
    </form>
  );
}
