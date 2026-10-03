// src/components/inbox/ThreadActions.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { fieldClasses } from "@/components/ui/fields";

// Each action calls `onDone` when it finishes; by default that re-renders the page
// (the /inbox pages), while the chat's Inbox tab passes its own refetch.

// Opening a conversation marks the other side's messages read. Done in the browser
// (not during the server render) so link prefetching can't mark things read.
export function MarkRead({ threadId, hasNew, onDone }: { threadId: string; hasNew: boolean; onDone?: () => void }) {
  const router = useRouter();
  useEffect(() => {
    if (!hasNew) return;
    supabaseBrowser()
      .rpc("mark_thread_read", { p_thread: threadId })
      .then(() => (onDone ? onDone() : router.refresh())); // update the unread counts
  }, [threadId, hasNew, router, onDone]);
  return null;
}

export function ReplyBox({ threadId, to, onDone }: { threadId: string; to: string; onDone?: () => void }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        setError("");
        const res = await fetch(`/api/threads/${threadId}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        const json = await res.json().catch(() => ({ ok: false }));
        setBusy(false);
        if (!json.ok) return setError(json.error ?? "Couldn't send. Please try again.");
        setBody("");
        if (onDone) onDone();
        else router.refresh();
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder={`Reply to ${to}…`}
        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-gray-500"
      />
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-gray-500">Sent messages are kept as a record and can&apos;t be edited.</p>
        <button
          disabled={busy || !body.trim()}
          className="rounded-lg bg-cyan-500 font-semibold hover:bg-cyan-600 px-5 py-2 text-sm text-white disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send reply"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

// A draft waiting for approval: shows the agent's notes (owner only), lets the owner
// edit it, and sends it. Used by the chat's Messages tab and the /inbox pages.
export function DraftReview({
  id,
  to,
  subject,
  body,
  warnings,
  draftedAt,
  onOpen,
  onDone,
}: {
  id: string;
  to: string;
  subject: string | null;
  body: string;
  warnings: string[];
  draftedAt: string;
  onOpen?: () => void; // "Open conversation"
  onDone?: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftSubject, setSubject] = useState(subject ?? "");
  const [draftBody, setBody] = useState(body);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");
  const field = fieldClasses;

  async function send() {
    setState("sending");
    setError("");
    const res = await fetch(`/api/inquiries/${id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing ? { subject: draftSubject, body: draftBody } : {}),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    if (!json.ok) {
      setState("error");
      return setError(json.error ?? "Couldn't send. Please try again.");
    }
    setState("idle");
    if (onDone) onDone();
    else router.refresh();
  }

  return (
    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-3 text-sm">
      <p className="text-xs text-gray-500">
        Draft to {to} · {new Date(draftedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
        <strong>not sent</strong>
      </p>

      {warnings.length > 0 && (
        <ul className="mt-2 list-inside list-disc rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {editing ? (
        <div className="mt-2 space-y-2">
          <input value={draftSubject} onChange={(e) => setSubject(e.target.value)} className={field} aria-label="Subject" />
          <textarea value={draftBody} onChange={(e) => setBody(e.target.value)} rows={10} className={field} aria-label="Message" />
        </div>
      ) : (
        <>
          {subject && <p className="mt-2 font-medium">{subject}</p>}
          <p className="mt-1 whitespace-pre-wrap">{body}</p>
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={state === "sending" || (editing && (!draftSubject.trim() || !draftBody.trim()))}
          onClick={send}
          className="rounded-lg bg-cyan-500 font-semibold hover:bg-cyan-600 px-4 py-1.5 text-white disabled:opacity-50"
        >
          {state === "sending" ? "Sending…" : state === "error" ? "Retry" : editing ? "Send edited" : "Approve & send"}
        </button>
        <button type="button" onClick={() => setEditing((e) => !e)} className="text-xs underline-offset-2 hover:underline">
          {editing ? "Cancel edits" : "Edit"}
        </button>
        {onOpen && (
          <button type="button" onClick={onOpen} className="text-xs underline-offset-2 hover:underline">
            Open conversation
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
