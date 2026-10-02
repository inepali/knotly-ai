// src/lib/mail-threads.ts — group mailbox items into conversations.
// Pure, so both the /inbox page (server) and the chat's Messages tab (client) use it.
import type { MailItem } from "@/lib/mailbox";

// Messages: sent and received together, one row per conversation.
// Drafts: the assistant's messages waiting for the couple to review and send.
export type MailView = "messages" | "drafts";

export type Conversation = {
  threadId: string;
  counterpart: string;
  subject: string | null;
  last: MailItem; // newest sent or received message
  unread: number; // received and not opened
  drafts: number; // waiting for review in this conversation
};

export function groupConversations(items: MailItem[]): Conversation[] {
  const byThread = new Map<string, MailItem[]>();
  for (const m of items) byThread.set(m.threadId, [...(byThread.get(m.threadId) ?? []), m]);

  const out: Conversation[] = [];
  for (const [threadId, msgs] of byThread) {
    const sent = msgs.filter((m) => m.folder !== "drafts");
    if (!sent.length) continue; // only drafts so far: lives under Drafts
    const sorted = [...sent].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const last = sorted.at(-1)!;
    out.push({
      threadId,
      counterpart: last.counterpart,
      subject: sorted[0].subject,
      last,
      unread: msgs.filter((m) => m.isNew).length,
      drafts: msgs.filter((m) => m.folder === "drafts").length,
    });
  }
  return out.sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
}

export function mailCounts(items: MailItem[]): Record<MailView, number> {
  return {
    messages: items.filter((i) => i.isNew).length, // unread, like an email client
    drafts: items.filter((i) => i.folder === "drafts").length,
  };
}
