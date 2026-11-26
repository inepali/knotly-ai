// src/components/dashboard/DashboardShell.tsx — sidebar + page, shared by the couple and vendor dashboards.
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import HelpWidget from "@/components/help/HelpWidget";
import { DashboardNav, type NavLink } from "./DashboardNav";

export function DashboardShell({
  links,
  help,
  footer,
  children,
}: {
  links: NavLink[];
  help: "couple" | "vendor";
  footer?: React.ReactNode; // pinned to the bottom of the sidebar
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[14rem_1fr]">
      <aside className="flex flex-col border-b border-gray-200 bg-white px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:self-start lg:overflow-y-auto lg:border-r lg:border-b-0 lg:py-6">
        <Link href="/" aria-label="Knotly home" className="mb-4 block lg:mb-8">
          <Logo />
        </Link>
        <DashboardNav links={links} />
        {footer && <div className="mt-4 lg:mt-auto">{footer}</div>}
      </aside>
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">{children}</main>
      <HelpWidget role={help} />
    </div>
  );
}
