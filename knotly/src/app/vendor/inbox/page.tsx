// src/app/vendor/inbox/page.tsx
// Needs You moved into the vendor dashboard. This stays so old links (emails sent by the
// agent) keep working.
import { redirect } from "next/navigation";

export default function Inbox() {
  redirect("/vendor/dashboard/needs-you");
}
