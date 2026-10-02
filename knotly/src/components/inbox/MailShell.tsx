// src/components/inbox/MailShell.tsx — header + folder list shared by the inbox pages.
import Link from "next/link";
import type { ReactNode } from "react";
import type { Folder, MailItem } from "@/lib/mailbox";

const FOLDERS: { key: Folder; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "sent", label: "Sent" },
  { key: "drafts", label: "Drafts" },
];

export function folderCounts(items: MailItem[]) {
  return {
    inbox: items.filter((i) => i.isNew).length, // unread, like an email client
    sent: items.filter((i) => i.folder === "sent").length,
    drafts: items.filter((i) => i.folder === "drafts").length,
  } satisfies Record<Folder, number>;
}

export default function MailShell({
  active,
  counts,
  showDrafts,
  children,
}: {
  active?: Folder;
  counts: Record<Folder, number>;
  showDrafts: boolean; // vendors never have drafts
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-800">
        <Link href="/chat" className="font-semibold">
          Knotly
        </Link>
        <Link href="/chat" className="text-sm text-gray-600 underline-offset-2 hover:underline dark:text-gray-400">
          Back to chat
        </Link>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 md:flex-row">
        <nav className="flex gap-1 md:w-44 md:flex-col" aria-label="Mailbox folders">
          {FOLDERS.filter((f) => showDrafts || f.key !== "drafts").map((f) => (
            <Link
              key={f.key}
              href={`/inbox?folder=${f.key}`}
              aria-current={active === f.key ? "page" : undefined}
              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
                active === f.key ? "bg-gray-100 font-medium dark:bg-gray-900" : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-900"
              }`}
            >
              {f.label}
              {counts[f.key] > 0 && (
                <span
                  className={`rounded-full px-2 text-xs ${
                    f.key === "inbox" ? "bg-black text-white dark:bg-white dark:text-black" : "text-gray-500"
                  }`}
                >
                  {counts[f.key]}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export function when(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
