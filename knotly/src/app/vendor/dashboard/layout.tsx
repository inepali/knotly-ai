// src/app/vendor/dashboard/layout.tsx — the vendor's dashboard shell: sidebar + page.
import VendorShell from "@/components/dashboard/VendorShell";

export const metadata = { title: "Vendor dashboard · Knotly" };

export default function VendorDashboardLayout({ children }: { children: React.ReactNode }) {
  return <VendorShell>{children}</VendorShell>;
}
