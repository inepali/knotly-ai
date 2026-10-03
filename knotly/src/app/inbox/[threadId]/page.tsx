// src/app/inbox/[threadId]/page.tsx — one conversation, oldest first, with a reply box.
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getViewer, isMine, loadMailbox, loadThread } from "@/lib/mailbox";
import MailShell from "@/components/inbox/MailShell";
import { mailCounts } from "@/lib/mail-threads";
import { DraftReview, MarkRead, ReplyBox } from "@/components/inbox/ThreadActions";

const AGENT = new Set(["couple_agent", "vendor_agent"]);

export default async function ThreadPage(props: PageProps<"/inbox/[threadId]">) {
  const { threadId } = await props.params;

  const sb = await supabaseServer();
  const viewer = await getViewer(sb);
  if (!viewer) redirect("/chat");

  const [messages, all] = await Promise.all([
    loadThread(sb, viewer.side, threadId),
    loadMailbox(sb, viewer.side),
  ]);
  if (messages.length === 0) notFound(); // not theirs, or nothing visible yet

  const counterpart = messages[0].counterpart;
  const subject = messages.find((m) => m.status === "sent")?.subject ?? messages[0].subject;

  return (
    <MailShell counts={mailCounts(all)}>
      <MarkRead threadId={threadId} hasNew={messages.some((m) => m.isNew)} />
      <h1 className="text-xl font-semibold">{subject ?? "Conversation"}</h1>
      <p className="mb-4 text-sm text-gray-500">With {counterpart}</p>

      <ol className="space-y-3">
        {messages.map((m) => {
          const mine = isMine(m.sender, viewer.side);
          const draft = m.status === "pending_approval";
          if (draft && mine)
            return (
              <li key={m.id}>
                <DraftReview
                  id={m.id}
                  to={counterpart}
                  subject={m.subject}
                  body={m.body}
                  warnings={m.warnings}
                  draftedAt={m.createdAt}
                />
              </li>
            );
          return (
            <li
              key={m.id}
              className={`rounded-xl border p-4 ${
                draft
                  ? "border-dashed border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
                  : mine
                    ? "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900"
                    : "border-gray-200 dark:border-gray-800"
              }`}
            >
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {mine ? "You" : counterpart}
                  {AGENT.has(m.sender) && <span className="font-normal text-gray-500"> · written with Knotly assistant</span>}
                  {draft && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">Draft — not sent</span>}
                  {m.isNew && <span className="ml-2 rounded-full bg-black px-2 py-0.5 text-xs text-white dark:bg-white dark:text-black">New</span>}
                </span>
                <time dateTime={m.createdAt} className="text-xs text-gray-500">
                  {new Date(m.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </time>
              </div>
              {m.subject && <p className="mb-1 font-medium">{m.subject}</p>}
              <p className="whitespace-pre-wrap text-sm">{m.body}</p>
            </li>
          );
        })}
      </ol>

      {messages.some((m) => m.status === "sent") && (
        <div className="mt-6">
          <ReplyBox threadId={threadId} to={counterpart} />
        </div>
      )}
    </MailShell>
  );
}
