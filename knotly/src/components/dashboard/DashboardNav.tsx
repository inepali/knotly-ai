// src/components/dashboard/DashboardNav.tsx — sidebar links with the current page highlighted.
// A link can have children: it becomes a menu that opens to show them (open by default when
// you're on one of its pages). Locked children are add-ons not unlocked yet (they open a preview).
"use client";
import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export type NavLink = { href: string; label: string; badge?: number; locked?: boolean; children?: NavLink[] };

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);
const itemClass = (active: boolean, muted = false) =>
  clsx(
    "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
    active ? "bg-cyan-50 text-cyan-800" : muted ? "text-gray-500 hover:bg-gray-100 hover:text-gray-900" : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
  );

function LockIcon(props: React.ComponentPropsWithoutRef<"svg">) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={clsx("h-4 w-4 flex-none text-gray-400 transition-transform", open && "rotate-180")}>
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Item({ l, path, nested = false }: { l: NavLink; path: string; nested?: boolean }) {
  const active = isActive(path, l.href);
  return (
    <Link href={l.href} aria-current={active ? "page" : undefined} className={clsx(itemClass(active, l.locked), nested && "lg:pl-6")}>
      {l.label}
      {l.locked && (
        <>
          <LockIcon className="h-3.5 w-3.5 flex-none text-gray-400" />
          <span className="sr-only">(not unlocked)</span>
        </>
      )}
      {!!l.badge && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{l.badge}</span>}
    </Link>
  );
}

function Menu({ l, path }: { l: NavLink; path: string }) {
  const kids = l.children ?? [];
  const inside = kids.some((k) => isActive(path, k.href));
  const [open, setOpen] = useState(inside);
  const id = `nav-${l.label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className={itemClass(inside && !open)}>
        {l.label}
        <Chevron open={open} />
      </button>
      {open && (
        <div id={id} role="group" aria-label={l.label} className="flex gap-1 lg:flex-col">
          {kids.map((k) => (
            <Item key={k.href} l={k} path={path} nested />
          ))}
        </div>
      )}
    </>
  );
}

export function DashboardNav({ links }: { links: NavLink[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto lg:flex-col">
      {links.map((l) => (
        <Fragment key={l.href}>{l.children?.length ? <Menu l={l} path={path} /> : <Item l={l} path={path} />}</Fragment>
      ))}
    </nav>
  );
}
