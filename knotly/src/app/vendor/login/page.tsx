// src/app/vendor/login/page.tsx
// Vendors sign up and sign in through the same chat flow as couples
// (the account card's "Wedding vendor" choice sets role = 'vendor').
import { redirect } from "next/navigation";

export default function VendorLogin() {
  redirect("/chat");
}
