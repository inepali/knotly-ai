// src/components/inbox/MailShell.tsx — folder tabs shared by the inbox pages. The page frame
// (sidebar) comes from src/app/inbox/layout.tsx, so this only renders inside the main content.
import Link from "next/link";
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
    <div>
      <nav className="mb-6 flex gap-1 border-b border-gray-200" aria-label="Mailbox folders">
        {FOLDERS.map((f) => (
          <Link
            key={f.key}
            href={`/inbox?folder=${f.key}`}
            aria-current={active === f.key ? "page" : undefined}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${
              active === f.key
                ? "border-cyan-600 text-cyan-800"
                : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900"
            }`}
          >
            {f.label}
            {counts[f.key] > 0 && (
              <span className={`rounded-full px-2 text-xs ${f.key === "messages" ? "bg-cyan-500 text-white" : "bg-gray-100 text-gray-600"}`}>
                {counts[f.key]}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className="min-w-0">{children}</div>
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
