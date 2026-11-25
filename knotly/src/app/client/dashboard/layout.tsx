// src/app/client/dashboard/layout.tsx — the couple's dashboard shell: sidebar + page.
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { requireCouple } from "@/lib/couple-session";

export const metadata = { title: "Dashboard · Knotly" };

const links = [
  { href: "/client/dashboard/my-wedding", label: "My Wedding" },
  { href: "/client/dashboard/vendors", label: "Estimates" },
  { href: "/inbox", label: "Messages" }, // the existing inbox, until it moves under the dashboard
  { href: "/client/dashboard/budget", label: "Budget" },
];

export default async function CoupleDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireCouple();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[14rem_1fr]">
      <aside className="border-b border-gray-200 bg-white px-4 py-4 lg:min-h-dvh lg:border-r lg:border-b-0 lg:py-6">
        <Link href="/" aria-label="Knotly home" className="mb-4 block lg:mb-8">
          <Logo />
        </Link>
        <DashboardNav links={links} />
      </aside>
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
