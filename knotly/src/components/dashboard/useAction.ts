// src/components/dashboard/useAction.ts — run a server action from a form: pending state,
// the error to show, and a callback for success.
"use client";
import { useState, useTransition } from "react";

type Result = { ok: boolean; error?: string };

export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  /** `okNotice` can be built from the action's result (e.g. "Saved. You have $10 in free credit"). */
  function run<R extends Result>(fn: () => Promise<R>, onOk?: (r: R) => void, okNotice: string | ((r: R) => string) = "") {
    setError("");
    setNotice("");
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else {
        setNotice(typeof okNotice === "function" ? okNotice(r) : okNotice);
        onOk?.(r);
      }
    });
  }
  return { pending, error, notice, run };
}

/** "" or non-numeric → undefined; otherwise a whole number. */
export const wholeNumber = (s: string) => (s.trim() !== "" && Number.isFinite(Number(s)) ? Math.round(Number(s)) : undefined);
