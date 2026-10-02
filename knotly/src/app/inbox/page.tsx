// src/app/inbox/page.tsx — Inbox / Sent / Drafts, like an email client.
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getViewer, loadMailbox, type Folder } from "@/lib/mailbox";
import MailShell, { folderCounts, when } from "@/components/inbox/MailShell";

const EMPTY: Record<Folder, string> = {
  inbox: "No messages yet. Replies will show up here.",
  sent: "Nothing sent yet.",
  drafts: "No drafts. Ask the assistant to draft an inquiry to a vendor.",
};

export default async function InboxPage(props: PageProps<"/inbox">) {
  const { folder: raw } = await props.searchParams;
  const folder: Folder = raw === "sent" || raw === "drafts" ? raw : "inbox";

  const sb = await supabaseServer();
  const viewer = await getViewer(sb);
  if (!viewer) redirect("/chat"); // guests sign in from the chat first

  const items = await loadMailbox(sb, viewer.side);
  const shown = items.filter((i) => i.folder === folder);

  return (
    <MailShell active={folder} counts={folderCounts(items)} showDrafts={viewer.side === "couple"}>
      <h1 className="mb-3 text-xl font-semibold capitalize">{folder}</h1>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
          {EMPTY[folder]}
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {shown.map((m) => (
            <li key={m.id}>
              <Link
                href={`/inbox/${m.threadId}`}
                className={`grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-baseline gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 ${
                  m.isNew ? "font-semibold" : ""
                }`}
              >
                <span className="truncate">
                  {folder === "inbox" ? "" : "To: "}
                  {m.counterpart}
                </span>
                <span className="min-w-0 truncate">
                  {m.isNew && (
                    <span className="mr-2 rounded-full bg-black px-2 py-0.5 text-xs font-medium text-white dark:bg-white dark:text-black">
                      New
                    </span>
                  )}
                  {m.folder === "drafts" && (
                    <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      Draft
                    </span>
                  )}
                  {m.subject ?? "(no subject)"}
                  <span className="font-normal text-gray-500"> — {m.body.slice(0, 120)}</span>
                </span>
                <time dateTime={m.createdAt} className="text-xs font-normal text-gray-500">
                  {when(m.createdAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MailShell>
  );
}
