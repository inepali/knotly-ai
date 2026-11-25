import { redirect } from "next/navigation";

export default function VendorDashboardHome() {
  redirect("/vendor/dashboard/needs-you");
}
