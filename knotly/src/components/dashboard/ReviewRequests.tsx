// src/components/dashboard/ReviewRequests.tsx — "Ask for a review": a vendor picks a couple they've
// talked to on Knotly, or types a past client's email, and Knotly sends the request.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/fields";
import { cancelReviewRequestAction, sendReviewRequestAction } from "@/app/vendor/dashboard/actions";
import { REQUEST_DAYS, requestState } from "@/lib/review-requests";
import { useAction } from "./useAction";

export type Client = { projectId: string; name: string; weddingDate: string | null };
export type SentRequest = {
  id: string;
  recipient_name: string;
  recipient_email: string | null;
  couple_id: string | null;
  status: string;
  created_at: string;
  expires_at: string;
};

const STATE_LABEL = { open: "Waiting", completed: "Reviewed", canceled: "Canceled", expired: "Expired" } as const;
const STATE_CLASS = {
  open: "bg-amber-50 text-amber-800",
  completed: "bg-emerald-50 text-emerald-800",
  canceled: "bg-gray-100 text-gray-600",
  expired: "bg-gray-100 text-gray-600",
} as const;
const date = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function ReviewRequests({ clients, requests }: { clients: Client[]; requests: SentRequest[] }) {
  const [mode, setMode] = useState<"client" | "email">(clients.length ? "client" : "email");
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const send = useAction();
  const cancel = useAction();
  // Couples who already have an open or finished request don't need another one.
  const asked = new Set(requests.filter((r) => r.status !== "canceled" && requestState(r) !== "expired").map((r) => r.recipient_name));
  const tab = (m: typeof mode) =>
    `flex-1 rounded-md px-3 py-1.5 text-sm ${mode === m ? "bg-white font-medium text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`;

  return (
    <div className="mt-6 rounded-2xl bg-gray-50 p-5 ring-1 ring-gray-900/5">
      <h3 className="text-sm font-semibold text-gray-900">Ask a past client for a review</h3>
      <p className="mt-1 text-sm text-gray-600">
        Knotly emails them a short request. Reviews from couples you worked with on Knotly show as <strong>Verified</strong>.
      </p>

      <div className="mt-4 flex max-w-sm gap-1 rounded-lg bg-gray-200/60 p-1" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "client"} className={tab("client")} onClick={() => setMode("client")}>
          Knotly client
        </button>
        <button type="button" role="tab" aria-selected={mode === "email"} className={tab("email")} onClick={() => setMode("email")}>
          By email
        </button>
      </div>

      <form
        className="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send.run(
            () =>
              mode === "client"
                ? sendReviewRequestAction({ to: "client", projectId, note: note.trim() || undefined })
                : sendReviewRequestAction({ to: "email", name: name.trim(), email: email.trim(), note: note.trim() || undefined }),
            () => {
              setProjectId("");
              setName("");
              setEmail("");
              setNote("");
            },
            "Request sent."
          );
        }}
      >
        {mode === "client" ? (
          clients.length ? (
            <select className={fieldClasses} value={projectId} onChange={(e) => setProjectId(e.target.value)} required aria-label="Couple">
              <option value="">Choose a couple you&apos;ve talked to…</option>
              {clients.map((c) => (
                <option key={c.projectId} value={c.projectId}>
                  {c.name}
                  {c.weddingDate ? ` · ${new Date(c.weddingDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                  {asked.has(c.name) ? " · already asked" : ""}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-600">
              No couples yet. Once you&apos;ve talked with a couple on Knotly, you can pick them here. For past clients, use{" "}
              <button type="button" className="underline" onClick={() => setMode("email")}>
                By email
              </button>
              .
            </p>
          )
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={fieldClasses} placeholder="Client name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} aria-label="Client name" />
            <input className={fieldClasses} type="email" placeholder="client@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Client email" />
          </div>
        )}
        {(mode === "email" || clients.length > 0) && (
          <>
            <textarea
              className={fieldClasses}
              rows={2}
              maxLength={500}
              placeholder="Add a personal note (optional), e.g. “It was a joy capturing your day!”"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label="Personal note"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" color="cyan" disabled={send.pending}>
                {send.pending ? "Sending…" : "Send request"}
              </Button>
              {send.error ? (
                <p role="alert" className="text-sm text-red-600">{send.error}</p>
              ) : send.notice ? (
                <p role="status" className="text-sm text-emerald-700">{send.notice}</p>
              ) : (
                <p className="text-xs text-gray-500">The link works once, for {REQUEST_DAYS} days.</p>
              )}
            </div>
          </>
        )}
      </form>

      {requests.length > 0 && (
        <div className="mt-5">
          <h4 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Sent requests</h4>
          <ul className="mt-2 divide-y divide-gray-200 text-sm">
            {requests.map((r) => {
              const s = requestState(r);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-medium text-gray-900">{r.recipient_name}</span>
                  <span className="text-gray-500">{r.couple_id ? "on Knotly" : r.recipient_email}</span>
                  <span className="text-gray-400">· {date(r.created_at)}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${STATE_CLASS[s]}`}>{STATE_LABEL[s]}</span>
                  {s === "open" && (
                    <button
                      type="button"
                      className="text-xs text-gray-500 underline hover:text-gray-900 disabled:opacity-50"
                      disabled={cancel.pending}
                      onClick={() => cancel.run(() => cancelReviewRequestAction({ id: r.id }))}
                    >
                      Cancel
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {cancel.error && <p role="alert" className="mt-1 text-sm text-red-600">{cancel.error}</p>}
        </div>
      )}
    </div>
  );
}
