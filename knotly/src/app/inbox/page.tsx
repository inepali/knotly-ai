// src/app/inbox/page.tsx — Messages (one row per conversation) and Drafts.
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getViewer, loadMailbox } from "@/lib/mailbox";
import { groupConversations, mailCounts, type MailView } from "@/lib/mail-threads";
import MailShell, { when } from "@/components/inbox/MailShell";
import { DraftReview } from "@/components/inbox/ThreadActions";

const empty = "rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700";

export default async function InboxPage(props: PageProps<"/inbox">) {
  const { folder: raw } = await props.searchParams;
  // Old ?folder=inbox / ?folder=sent links land on Messages.
  const folder: MailView = raw === "drafts" ? "drafts" : "messages";

  const sb = await supabaseServer();
  const viewer = await getViewer(sb);
  if (!viewer) redirect("/chat"); // guests sign in from the chat first

  const items = await loadMailbox(sb, viewer.side);
  const conversations = groupConversations(items);
  const drafts = items.filter((i) => i.folder === "drafts");

  return (
    <MailShell active={folder} counts={mailCounts(items)}>
      <h1 className="mb-3 text-xl font-semibold">{folder === "drafts" ? "Drafts" : "Messages"}</h1>

      {folder === "messages" &&
        (conversations.length === 0 ? (
          <p className={empty}>No conversations yet. Messages you send and replies you get will show up here.</p>
        ) : (
          <ul className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {conversations.map((c) => (
              <li key={c.threadId}>
                <Link
                  href={`/inbox/${c.threadId}`}
                  className={`grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] items-baseline gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 ${
                    c.unread ? "font-semibold" : ""
                  }`}
                >
                  <span className="truncate">
                    {c.counterpart}
                    {c.unread > 0 && (
                      <span className="ml-2 rounded-full bg-black px-2 py-0.5 text-xs text-white dark:bg-white dark:text-black">{c.unread} new</span>
                    )}
                  </span>
                  <span className="min-w-0 truncate">
                    {c.drafts > 0 && (
                      <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        {c.drafts} draft{c.drafts === 1 ? "" : "s"}
                      </span>
                    )}
                    {c.subject ?? "(no subject)"}
                    <span className="font-normal text-gray-500">
                      {" "}
                      — {c.last.folder === "sent" ? "You: " : ""}
                      {c.last.body.slice(0, 120)}
                    </span>
                  </span>
                  <time dateTime={c.last.createdAt} className="text-xs font-normal text-gray-500">
                    {when(c.last.createdAt)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        ))}

      {folder === "drafts" &&
        (drafts.length === 0 ? (
          <p className={empty}>
            {viewer.side === "vendor"
              ? "No drafts. Your assistant's replies to couples wait here for your approval."
              : "No drafts. When the assistant writes to a vendor for you, it waits here for your review."}
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-gray-500">
              Nothing here has been sent. Review each {viewer.side === "vendor" ? "reply" : "message"}, then tap Send.
            </p>
            <ul className="space-y-3">
              {drafts.map((d) => (
                <li key={d.id} className="space-y-1">
                  <DraftReview
                    id={d.id}
                    to={d.counterpart}
                    subject={d.subject}
                    body={d.body}
                    warnings={d.warnings}
                    draftedAt={d.createdAt}
                  />
                  <Link href={`/inbox/${d.threadId}`} className="text-xs text-gray-500 underline-offset-2 hover:underline">
                    Open conversation
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ))}
    </MailShell>
  );
}
