// src/components/chat/cards/VerificationCard.tsx
"use client";
import { useState } from "react";

export default function VerificationCard({
  reason,
  onDone,
}: {
  reason: string;
  onDone: (msg: string) => void;
}) {
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState("");

  async function post(url: string, body: object) {
    setError("");
    const res = await fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) setError(json.error ?? "Something went wrong");
    return json;
  }

  if (step === "done")
    return <p className="text-sm text-emerald-700">✓ Email verified</p>;

  return (
    <div className="max-w-sm space-y-2 rounded-xl border p-4">
      <p className="text-sm">{reason}</p>
      {step === "email" ? (
        <>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded border px-3 py-2"
          />
          <button
            className="rounded bg-black px-3 py-1.5 text-white"
            onClick={async () =>
              (await post("/api/auth/start", { email })).ok && setStep("code")
            }
          >
            Email me a code
          </button>
        </>
      ) : (
        <>
          <input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            className="w-full rounded border px-3 py-2 tracking-widest"
          />
          <label className="flex gap-2 text-xs">
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
            />
            I agree to Knotly's Terms, including AI-assisted messaging.
          </label>
          <button
            className="rounded bg-black px-3 py-1.5 text-white"
            onClick={async () => {
              const r = await post("/api/auth/verify", {
                email,
                code,
                acceptedTerms: terms,
              });
              if (!r.ok) return;
              setStep("done");
              onDone(
                r.conflicts?.length
                  ? `I verified my email. My saved plan differs from today: ${JSON.stringify(
                      r.conflicts
                    )}`
                  : `I verified my email.${
                      r.returning ? " (returning couple)" : ""
                    }`
              );
            }}
          >
            Verify
          </button>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
