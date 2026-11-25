// src/app/vendor/login/page.tsx
// Vendors sign in on the shared /signin page (new vendors choose "Wedding vendor" at /signup).
import { redirect } from "next/navigation";

export default function VendorLogin() {
  redirect("/signin");
}
