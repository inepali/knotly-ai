// src/components/chat/cards/AccountCard.tsx
"use client";
import { useState } from "react";

// signup → code: create an account.  signin: password sign-in.
// forgot → reset: email/phone a code, then set a new password (which also signs in).
type Mode = "signup" | "code" | "signin" | "forgot" | "reset" | "done";
type Method = "email" | "phone";
export type Role = "couple" | "vendor" | "admin";

// Remembered so a later visit (signed out, same browser) is offered sign-in, not sign-up.
export const HAS_ACCOUNT_KEY = "knotly:has-account";

const TITLES: Record<Exclude<Mode, "done">, string> = {
  signup: "Create your Knotly account",
  code: "Check your messages",
  signin: "Sign in to Knotly",
  forgot: "Reset your password",
  reset: "Choose a new password",
};
const SUBMIT: Record<Exclude<Mode, "done">, string> = {
  signup: "Create account",
  code: "Verify and finish",
  signin: "Sign in",
  forgot: "Send reset code",
  reset: "Reset password",
};

// One card for everyone: couples, vendors and admins sign in the same way.
// The role is chosen only when creating an account.
export default function AccountCard({
  initialMode,
  initialRole = "couple",
  reason,
  onDone,
}: {
  initialMode: "signup" | "signin";
  initialRole?: "couple" | "vendor";
  reason: string;
  onDone: (msg: string, role: Role) => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [role, setRole] = useState<"couple" | "vendor">(initialRole);
  const [method, setMethod] = useState<Method>("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
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

  function go(next: Mode, message = "") {
    setMode(next);
    setNotice(message);
    setError("");
    setCode("");
    if (next !== "code") setPassword("");
    setConfirm("");
  }

  function finish(msg: string, signedInAs: Role) {
    try {
      localStorage.setItem(HAS_ACCOUNT_KEY, "1");
    } catch {}
    setMode("done");
    onDone(msg, signedInAs);
  }

  const signedInMessage = (r: { conflicts?: unknown[] }, base: string) =>
    r.conflicts?.length
      ? `${base} My saved plan differs from what I said today: ${JSON.stringify(r.conflicts)}`
      : base;

  async function requestReset() {
    const r = await post("/api/auth/reset/request", {});
    if (r.ok)
      go("reset", `If there's an account for ${identifier.trim()}, we sent it a code. It can take a minute to arrive.`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup") {
      if (password.length < 8) return setError("Use at least 8 characters for your password.");
      if (!terms) return setError("Please accept the terms.");
      const r = await post("/api/auth/signup", {});
      if (r.ok) setMode("code");
      else if (r.exists) go("signin", "Looks like you already have an account. Sign in to continue.");
    } else if (mode === "code") {
      const r = await post("/api/auth/verify", { code: code.trim(), password, acceptedTerms: terms, role });
      if (r.ok)
        finish(r.role === "vendor" ? "I created my vendor account." : "I created my account.", r.role ?? role);
    } else if (mode === "signin") {
      const r = await post("/api/auth/signin", { password });
      if (r.ok) finish(signedInMessage(r, "I signed in."), r.role ?? "couple");
    } else if (mode === "forgot") {
      await requestReset();
    } else if (mode === "reset") {
      if (password.length < 8) return setError("Use at least 8 characters for your password.");
      if (password !== confirm) return setError("The passwords don't match.");
      const r = await post("/api/auth/reset/confirm", { code: code.trim(), password });
      if (r.ok) finish(signedInMessage(r, "I reset my password and signed in."), r.role ?? "couple");
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
  const link = "underline disabled:opacity-50";
  const askIdentifier = mode === "signup" || mode === "signin" || mode === "forgot";
  const askCode = mode === "code" || mode === "reset";

  return (
    <form
      onSubmit={submit}
      className="my-2 max-w-sm space-y-3 rounded-xl border border-gray-300 p-4 text-left dark:border-gray-700"
    >
      <p className="font-medium">{TITLES[mode]}</p>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {notice ||
          (mode === "forgot"
            ? "Enter the email or phone on your account and we'll send you a code."
            : mode === "code"
              ? `Enter the code we sent to ${identifier.trim()}.`
              : reason)}
      </p>

      {mode === "signup" && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
          {(
            [
              ["couple", "Planning a wedding"],
              ["vendor", "Wedding vendor"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={role === value}
              onClick={() => setRole(value)}
              className={`rounded-lg border px-3 py-2 text-sm ${
                role === value
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {askIdentifier && (
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
        </>
      )}

      {askCode && (
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={10}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code"
          className={`${field} tracking-widest`}
          required
          autoFocus
        />
      )}

      {(mode === "signup" || mode === "signin" || mode === "reset") && (
        <input
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "signin" ? "Password" : mode === "reset" ? "New password (8+ characters)" : "Password (8+ characters)"}
          className={field}
          required
        />
      )}
      {mode === "reset" && (
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          className={field}
          required
        />
      )}

      {mode === "signin" && (
        <p className="-mt-1 text-right text-xs">
          <button type="button" className={link} onClick={() => go("forgot")}>
            Forgot password?
          </button>
        </p>
      )}

      {mode === "signup" && (
        <label className="flex gap-2 text-xs text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          I agree to Knotly&apos;s Terms and Privacy Policy, including AI-assisted messaging.
        </label>
      )}

      <button
        disabled={busy}
        className="w-full rounded-lg bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {busy ? "Please wait…" : SUBMIT[mode]}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-xs text-gray-500">
        {mode === "signin" && (
          <>
            New to Knotly?{" "}
            <button type="button" className={link} onClick={() => go("signup")}>
              Create an account
            </button>
          </>
        )}
        {mode === "signup" && (
          <>
            Already have an account?{" "}
            <button type="button" className={link} onClick={() => go("signin")}>
              Sign in
            </button>
          </>
        )}
        {mode === "code" && (
          <>
            Wrong {method}?{" "}
            <button type="button" className={link} onClick={() => go("signup")}>
              Go back
            </button>
          </>
        )}
        {mode === "forgot" && (
          <button type="button" className={link} onClick={() => go("signin")}>
            Back to sign in
          </button>
        )}
        {mode === "reset" && (
          <>
            No code?{" "}
            <button type="button" className={link} disabled={busy} onClick={requestReset}>
              Send another
            </button>{" "}
            ·{" "}
            <button type="button" className={link} onClick={() => go("forgot")}>
              Use a different {method}
            </button>
          </>
        )}
      </p>
    </form>
  );
}
