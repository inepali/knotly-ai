// src/components/dashboard/ReportSpamButton.tsx — "Report as spam" on a charged lead (Account).
"use client";
import { useState } from "react";
import { reportSpamLeadAction } from "@/app/vendor/dashboard/actions";
import { useAction } from "./useAction";
import { SPAM_REASON_LABELS } from "@/lib/actions/spam";
import { fieldClasses } from "@/components/ui/fields";

type Reason = keyof typeof SPAM_REASON_LABELS;

export default function ReportSpamButton({ quoteId }: { quoteId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>("fake_couple");
  const [details, setDetails] = useState("");
  const act = useAction();

  if (act.notice) return <span className="text-xs text-gray-600">{act.notice}</span>;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-gray-500 underline hover:text-gray-800">
        Report as spam
      </button>
    );
  return (
    <form
      className="mt-2 space-y-2 rounded-lg bg-gray-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        act.run(() => reportSpamLeadAction({ quoteId, reason, details: details.trim() || undefined }), undefined, "Reported. We'll review it and return the $1 if it's spam.");
      }}
    >
      <label className="block text-xs font-semibold text-gray-900">
        What was wrong?
        <select className={`${fieldClasses} mt-1`} value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
          {Object.entries(SPAM_REASON_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold text-gray-900">
        Anything we should know? (optional)
        <textarea className={`${fieldClasses} mt-1`} rows={2} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={act.pending} className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
          {act.pending ? "Sending…" : "Send report"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-600">
          Cancel
        </button>
      </div>
      {act.error && (
        <p role="alert" className="text-xs text-red-700">
          {act.error}
        </p>
      )}
    </form>
  );
}
