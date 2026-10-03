// src/components/inbox/MailShell.tsx — header + folder list shared by the inbox pages.
import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { SiteFooter } from "@/components/ui/SiteFooter";
import type { ReactNode } from "react";
import type { MailView } from "@/lib/mail-threads";

const FOLDERS: { key: MailView; label: string }[] = [
  { key: "messages", label: "Messages" },
  { key: "drafts", label: "Drafts" },
];

export default function MailShell({
  active,
  counts,
  children,
}: {
  active?: MailView;
  counts: Record<MailView, number>;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pb-16 sm:px-6 md:flex-row lg:px-8">
        <nav className="flex gap-1 md:w-44 md:flex-col" aria-label="Mailbox folders">
          {FOLDERS.map((f) => (
            <Link
              key={f.key}
              href={`/inbox?folder=${f.key}`}
              aria-current={active === f.key ? "page" : undefined}
              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
                active === f.key
                  ? "bg-white font-semibold text-gray-900 shadow-sm ring-1 ring-gray-900/5"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {f.label}
              {counts[f.key] > 0 && (
                <span
                  className={`rounded-full px-2 text-xs ${
                    f.key === "messages" ? "bg-cyan-500 text-white" : "text-gray-500"
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
      <SiteFooter />
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
