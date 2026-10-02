// src/components/inbox/ThreadActions.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

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

export function SendDraftButton({ messageId, onDone }: { messageId: string; onDone?: () => void }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  return (
    <button
      type="button"
      disabled={state === "sending"}
      onClick={async () => {
        setState("sending");
        const res = await fetch(`/api/inquiries/${messageId}/send`, { method: "POST" });
        if (!res.ok) return setState("error");
        setState("idle");
        if (onDone) onDone();
        else router.refresh();
      }}
      className="rounded-full bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
    >
      {state === "sending" ? "Sending…" : state === "error" ? "Retry send" : "Send"}
    </button>
  );
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
        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950"
      />
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-gray-500">Sent messages are kept as a record and can&apos;t be edited.</p>
        <button
          disabled={busy || !body.trim()}
          className="rounded-full bg-black px-5 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {busy ? "Sending…" : "Send reply"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
