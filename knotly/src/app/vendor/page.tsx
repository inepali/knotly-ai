// src/app/vendor/page.tsx — the old vendor home. Vendors now start in their dashboard;
// anyone else is sent where they belong.
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/vendor-session";

export default async function VendorPage() {
  await requireVendor();
  redirect("/vendor/dashboard/needs-you");
}
