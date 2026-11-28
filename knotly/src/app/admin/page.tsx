// Admin home: links to the admin tools.
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";

export const metadata = { title: "Knotly admin" };

export default async function AdminHome() {
  await requireAdmin();
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Knotly admin</h1>
      <ul className="mt-6 space-y-2 text-sm">
        <li>
          <Link href="/admin/spam-reports" className="text-cyan-700 underline">Spam reports</Link>
          <span className="text-gray-500"> · review leads vendors reported, ban spam couples</span>
        </li>
        <li>
          <Link href="/admin/pricing" className="text-cyan-700 underline">Vendor pricing</Link>
          <span className="text-gray-500"> · lead fee, signup credit, reloads, texts, per metro</span>
        </li>
      </ul>
    </main>
  );
}
