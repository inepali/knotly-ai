// src/components/dashboard/DashboardNav.tsx — sidebar links with the current page highlighted.
// Links can be grouped under a section heading (shown on wide screens) and marked locked
// (an add-on the couple hasn't unlocked yet; the page shows its preview).
"use client";
import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export type NavLink = { href: string; label: string; badge?: number; section?: string; locked?: boolean };

function LockIcon(props: React.ComponentPropsWithoutRef<"svg">) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function DashboardNav({ links }: { links: NavLink[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto lg:flex-col">
      {links.map((l, i) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        const heading = l.section && l.section !== links[i - 1]?.section ? l.section : null;
        return (
          <Fragment key={l.href}>
            {heading && (
              <p className="mt-4 hidden px-3 pb-1 text-xs font-semibold tracking-wide text-gray-400 uppercase lg:block">{heading}</p>
            )}
            <Link
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                active ? "bg-cyan-50 text-cyan-800" : l.locked ? "text-gray-500 hover:bg-gray-100 hover:text-gray-900" : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              {l.label}
              {l.locked && (
                <>
                  <LockIcon className="h-3.5 w-3.5 flex-none text-gray-400" />
                  <span className="sr-only">(not unlocked)</span>
                </>
              )}
              {!!l.badge && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{l.badge}</span>
              )}
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
