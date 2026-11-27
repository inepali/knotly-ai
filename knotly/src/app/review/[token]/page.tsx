// /review/{token} — the page a vendor's emailed review request links to. No account needed;
// the link works once. Not indexed.
import type { Metadata } from "next";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadReviewByToken } from "@/lib/actions/review-requests";
import { categoryLabel } from "@/lib/categories";
import ReviewForm from "@/components/reviews/ReviewForm";
import { Logo } from "@/components/ui/Logo";
import { panelClasses } from "@/components/ui/fields";
import { submitEmailReviewAction } from "./actions";

export const metadata: Metadata = { title: "Write a review · Knotly", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const CLOSED = {
  completed: "This review has already been posted. Thank you!",
  canceled: "This review request was withdrawn.",
  expired: "This review link has expired. Ask your vendor to send a new one.",
  invalid: "This review link isn't valid. Check that you copied the whole link from the email.",
} as const;

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await loadReviewByToken(supabaseAdmin, token);

  return (
    <main className="flex min-h-dvh flex-col items-center bg-gray-50 px-4 py-10">
      <Link href="/" aria-label="Knotly home">
        <Logo />
      </Link>
      <div className={`${panelClasses} mt-8 w-full max-w-lg p-6 sm:p-8`}>
        {view.state === "open" ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">Review {view.vendorName}</h1>
            <p className="mt-1 text-sm text-gray-600">
              {view.category ? `${categoryLabel(view.category)} · ` : ""}They asked if you&apos;d share how it went.
            </p>
            {view.note && (
              <blockquote className="mt-4 rounded-xl bg-cyan-50 px-4 py-3 text-sm text-gray-800">
                &ldquo;{view.note}&rdquo;
                <span className="mt-1 block text-xs text-gray-500">{view.vendorName}</span>
              </blockquote>
            )}
            <div className="mt-6">
              <ReviewForm vendorName={view.vendorName} defaultName={view.clientName} submit={submitEmailReviewAction.bind(null, token)} />
            </div>
          </>
        ) : (
          <div className="text-center">
            <h1 className="text-lg font-semibold text-gray-900">{"vendorName" in view ? view.vendorName : "Review link"}</h1>
            <p className="mt-2 text-sm text-gray-600">{CLOSED[view.state]}</p>
            <Link href="/" className="mt-4 inline-block text-sm text-cyan-700 underline">Go to Knotly</Link>
          </div>
        )}
      </div>
    </main>
  );
}
