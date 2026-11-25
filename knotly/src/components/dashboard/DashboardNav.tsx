// src/components/dashboard/DashboardNav.tsx — sidebar links with the current page highlighted.
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function DashboardNav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto lg:flex-col">
      {links.map((l) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "bg-cyan-50 text-cyan-800" : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
