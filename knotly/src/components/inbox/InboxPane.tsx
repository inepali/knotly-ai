// src/components/inbox/InboxPane.tsx — the mailbox inside the chat's right-hand pane.
// Same data and actions as the /inbox pages, loaded from /api/inbox.
"use client";
import { useCallback, useEffect, useState } from "react";
import type { MailItem, Side } from "@/lib/mailbox";
import { groupConversations, mailCounts, type MailView } from "@/lib/mail-threads";
import { DraftReview, MarkRead, ReplyBox } from "./ThreadActions";

type ThreadItem = MailItem & { mine: boolean };
const AGENT = new Set(["couple_agent", "vendor_agent"]);

const when = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function InboxPane({
  onChange,
  refreshKey = 0,
  initialThreadId = null,
}: {
  onChange?: () => void;
  refreshKey?: number;
  initialThreadId?: string | null; // open straight into this conversation
}) {
  const [folder, setFolder] = useState<MailView>("messages");
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [list, setList] = useState<{ side: Side; items: MailItem[] } | null>(null);
  const [thread, setThread] = useState<ThreadItem[] | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0); // bump to refetch

  // After any change: refetch here and let the chat update its unread badge.
  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    onChange?.();
  }, [onChange]);

  useEffect(() => {
    let off = false;
    fetch("/api/inbox")
      .then((r) => r.json())
      .then((j) => {
        if (off) return;
        if (j.ok) setList({ side: j.side, items: j.items });
        else setError(j.error ?? "Couldn't load your inbox.");
      })
      .catch(() => !off && setError("Couldn't load your inbox."));
    return () => {
      off = true;
    };
  }, [version, refreshKey]);

  useEffect(() => {
    if (!threadId) return;
    let off = false;
    fetch(`/api/inbox/${threadId}`)
      .then((r) => r.json())
      .then((j) => !off && setThread(j.ok ? j.items : []));
    return () => {
      off = true;
    };
  }, [threadId, version, refreshKey]);

  if (error) return <p className="p-4 text-sm text-red-600">{error}</p>;
  if (!list) return <p className="p-4 text-sm text-gray-500">Loading your inbox…</p>;

  const items = list.items;
  const counts = mailCounts(items);
  const folders: { key: MailView; label: string; count: number }[] = [
    { key: "messages", label: "Messages", count: counts.messages },
    // The assistant's messages wait here for review before going out (both sides).
    { key: "drafts", label: "Drafts", count: counts.drafts },
  ];

  // One conversation.
  if (threadId) {
    if (!thread) return <p className="p-4 text-sm text-gray-500">Loading conversation…</p>;
    const counterpart = thread[0]?.counterpart ?? "";
    const subject = thread.find((m) => m.status === "sent")?.subject ?? thread[0]?.subject;
    return (
      <div className="space-y-3">
        <MarkRead threadId={threadId} hasNew={thread.some((m) => m.isNew)} onDone={refresh} />
        <button
          type="button"
          onClick={() => {
            setThreadId(null);
            setThread(null);
          }}
          className="text-sm text-gray-600 underline-offset-2 hover:underline"
        >
          ← Back to {folder === "drafts" ? "drafts" : "messages"}
        </button>
        <div>
          <h3 className="font-semibold">{subject ?? "Conversation"}</h3>
          <p className="text-sm text-gray-500">With {counterpart}</p>
        </div>
        <ol className="space-y-3">
          {thread.map((m) => {
            const draft = m.status === "pending_approval";
            if (draft && m.mine)
              return (
                <li key={m.id}>
                  <DraftReview
                    id={m.id}
                    to={counterpart}
                    subject={m.subject}
                    body={m.body}
                    warnings={m.warnings}
                    draftedAt={m.createdAt}
                    onDone={refresh}
                  />
                </li>
              );
            return (
              <li
                key={m.id}
                className={`rounded-xl border p-3 text-sm ${
                  draft
                    ? "border-dashed border-amber-300 bg-amber-50/50"
                    : m.mine
                      ? "border-gray-200 bg-gray-50"
                      : "border-gray-200"
                }`}
              >
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {m.mine ? "You" : counterpart}
                    {AGENT.has(m.sender) && <span className="font-normal text-gray-500"> · with Knotly assistant</span>}
                    {draft && <span className="ml-2 rounded-full bg-amber-100 px-2 text-xs text-amber-900">Draft</span>}
                    {m.isNew && <span className="ml-2 rounded-lg bg-cyan-500 font-semibold hover:bg-cyan-600 px-2 text-xs text-white">New</span>}
                  </span>
                  <time dateTime={m.createdAt} className="text-xs text-gray-500">
                    {new Date(m.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </div>
                {m.subject && <p className="font-medium">{m.subject}</p>}
                <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
              </li>
            );
          })}
        </ol>
        {thread.some((m) => m.status === "sent") && (
          <ReplyBox threadId={threadId} to={counterpart} onDone={refresh} />
        )}
      </div>
    );
  }

  // Messages (one row per conversation) or Drafts (each one, to review and send).
  const conversations = groupConversations(items);
  const drafts = items.filter((i) => i.folder === "drafts");
  const open = (id: string) => setThreadId(id);

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-sm" role="tablist" aria-label="Folders">
        {folders.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={folder === f.key}
            onClick={() => setFolder(f.key)}
            className={`flex-1 rounded-md px-3 py-1 ${folder === f.key ? "bg-white font-medium shadow-sm" : "text-gray-500"}`}
          >
            {f.label}
            {f.count > 0 && <span className="ml-1 text-xs">({f.count})</span>}
          </button>
        ))}
      </div>

      {folder === "messages" &&
        (conversations.length === 0 ? (
          <Empty>No conversations yet. Messages you send and replies you get will show up here.</Empty>
        ) : (
          <ul className="divide-y divide-gray-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-900/5">
            {conversations.map((c) => (
              <li key={c.threadId}>
                <button
                  type="button"
                  onClick={() => open(c.threadId)}
                  className={`block w-full px-3 py-2.5 text-left hover:bg-gray-50 ${c.unread ? "font-semibold" : ""}`}
                >
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate">
                      {c.counterpart}
                      {c.unread > 0 && (
                        <span className="ml-2 rounded-lg bg-cyan-500 font-semibold hover:bg-cyan-600 px-1.5 text-xs text-white">{c.unread} new</span>
                      )}
                      {c.drafts > 0 && (
                        <span className="ml-2 rounded-full bg-amber-100 px-1.5 text-xs font-normal text-amber-900">
                          {c.drafts} draft{c.drafts === 1 ? "" : "s"}
                        </span>
                      )}
                    </span>
                    <time dateTime={c.last.createdAt} className="shrink-0 text-xs font-normal text-gray-500">
                      {when(c.last.createdAt)}
                    </time>
                  </span>
                  <span className="block truncate text-sm">{c.subject ?? "(no subject)"}</span>
                  <span className="block truncate text-sm font-normal text-gray-500">
                    {c.last.folder === "sent" ? "You: " : ""}
                    {c.last.body.slice(0, 120)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}

      {folder === "drafts" &&
        (drafts.length === 0 ? (
          <Empty>
            {list.side === "vendor"
              ? "No drafts. Your assistant's replies to couples wait here for your approval."
              : "No drafts. When the assistant writes to a vendor for you, it waits here for your review."}
          </Empty>
        ) : (
          <>
            <p className="text-xs text-gray-500">
              Nothing here has been sent. Review each {list.side === "vendor" ? "reply" : "message"}, then tap Send.
            </p>
            <ul className="space-y-3">
              {drafts.map((d) => (
                <li key={d.id}>
                  <DraftReview
                    id={d.id}
                    to={d.counterpart}
                    subject={d.subject}
                    body={d.body}
                    warnings={d.warnings}
                    draftedAt={d.createdAt}
                    onOpen={() => open(d.threadId)}
                    onDone={refresh}
                  />
                </li>
              ))}
            </ul>
          </>
        ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
      {children}
    </p>
  );
}
