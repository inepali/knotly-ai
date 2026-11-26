// src/app/client/dashboard/layout.tsx — the couple's dashboard shell: sidebar + page.
import CoupleShell from "@/components/dashboard/CoupleShell";

export const metadata = { title: "Dashboard · Knotly" };

export default function CoupleDashboardLayout({ children }: { children: React.ReactNode }) {
  return <CoupleShell>{children}</CoupleShell>;
}
