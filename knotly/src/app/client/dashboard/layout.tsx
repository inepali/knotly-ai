// src/app/client/dashboard/layout.tsx — the couple's dashboard shell: sidebar + page.
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { requireCouple } from "@/lib/couple-session";

export const metadata = { title: "Dashboard · Knotly" };

const links = [
  { href: "/client/dashboard/my-wedding", label: "My Wedding" },
  { href: "/client/dashboard/vendors", label: "Estimates" },
  { href: "/inbox", label: "Messages" }, // the existing inbox, until it moves under the dashboard
  { href: "/client/dashboard/budget", label: "My Budgets" },
];

export default async function CoupleDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireCouple();
  return <DashboardShell links={links} help="couple">{children}</DashboardShell>;
}
