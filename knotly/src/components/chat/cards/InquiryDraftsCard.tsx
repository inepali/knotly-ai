// src/components/chat/cards/InquiryDraftsCard.tsx
"use client";
import { useState } from "react";

type Draft = { id: string; subject: string; body: string; vendorName: string };

export default function InquiryDraftsCard({
  data,
}: {
  data: { ok: boolean; drafts?: Draft[]; error?: string };
}) {
  const [state, setState] = useState<
    Record<string, "sending" | "sent" | "error">
  >({});
  if (!data.ok) return <p className="text-sm text-red-600">{data.error}</p>;

  async function send(id: string) {
    setState((s) => ({ ...s, [id]: "sending" }));
    const res = await fetch(`/api/inquiries/${id}/send`, { method: "POST" });
    setState((s) => ({ ...s, [id]: res.ok ? "sent" : "error" }));
  }

  return (
    <div className="grid gap-3 text-left">
      {data.drafts!.map((d) => (
        <div key={d.id} className="rounded-2xl border p-4">
          <p className="text-xs text-gray-500">To {d.vendorName} · draft</p>
          <strong>{d.subject}</strong>
          <p className="mt-1 whitespace-pre-wrap text-sm">{d.body}</p>
          <button
            disabled={state[d.id] === "sending" || state[d.id] === "sent"}
            onClick={() => send(d.id)}
            className="mt-3 rounded-lg bg-cyan-500 font-semibold hover:bg-cyan-600 px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {{ sending: "Sending…", sent: "Sent ✓", error: "Retry" }[
              state[d.id] as string
            ] ?? "Send"}
          </button>
        </div>
      ))}
    </div>
  );
}
