// src/components/admin/SpamReportActions.tsx — Approve / Reject / Ban couple on one spam report.
"use client";
import { useState, useTransition } from "react";
import { banSpamCoupleAction, resolveSpamReportAction } from "@/app/admin/actions";

export default function SpamReportActions({ reportId, coupleId, coupleName }: { reportId: string; coupleId: string | null; coupleName: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const go = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      setError("");
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else setMsg(done);
    });

  if (msg) return <p className="text-sm text-emerald-700">✓ {msg}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        disabled={pending}
        onClick={() => go(() => resolveSpamReportAction(reportId, true), "Approved; the vendor got $1 back")}
        className="rounded-lg bg-gray-800 px-3 py-1.5 font-semibold text-white disabled:opacity-40"
      >
        Approve (credit $1)
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => go(() => resolveSpamReportAction(reportId, false), "Rejected")}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-gray-700 disabled:opacity-40"
      >
        Reject
      </button>
      {coupleId && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Ban ${coupleName} as spam? They can't sign in again, and every vendor they cost a lead gets $1 back.`)) return;
            go(() => banSpamCoupleAction(coupleId), `Banned ${coupleName}; vendors credited`);
          }}
          className="rounded-lg px-3 py-1.5 text-red-700 hover:bg-red-50 disabled:opacity-40"
        >
          Ban couple as spam
        </button>
      )}
      {error && (
        <p role="alert" className="w-full text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
