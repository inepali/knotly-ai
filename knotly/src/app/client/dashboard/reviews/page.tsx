// Reviews vendors asked this couple for. Written here, signed in, they show as "Verified Knotly client".
import { requireCouple } from "@/lib/couple-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listMyReviewRequests } from "@/lib/actions/review-requests";
import { categoryLabel } from "@/lib/categories";
import ReviewForm from "@/components/reviews/ReviewForm";
import { panelClasses } from "@/components/ui/fields";
import { submitClientReviewAction } from "../actions";

export default async function ReviewsPage() {
  const { sb, userId } = await requireCouple();
  const [requests, { data: project }] = await Promise.all([
    listMyReviewRequests(sb, supabaseAdmin, userId),
    sb.from("couple_projects").select("partner_names").eq("couple_id", userId).maybeSingle(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
      <p className="mt-1 text-sm text-gray-600">Vendors you worked with asked for a few words. Your review shows on their page as from a verified Knotly couple.</p>
      {requests.length === 0 ? (
        <p className={`${panelClasses} mt-6 p-6 text-sm text-gray-600`}>No review requests right now.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {requests.map((r) => (
            <section key={r.id} className={`${panelClasses} p-6`}>
              <h2 className="text-base font-semibold">{r.vendorName}</h2>
              <p className="text-sm text-gray-500">
                {r.category ? `${categoryLabel(r.category)} · ` : ""}Open until {new Date(r.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>
              {r.note && <blockquote className="mt-3 rounded-xl bg-cyan-50 px-4 py-3 text-sm text-gray-800">&ldquo;{r.note}&rdquo;</blockquote>}
              <div className="mt-5">
                <ReviewForm
                  vendorName={r.vendorName}
                  defaultName={project?.partner_names ?? ""}
                  submit={async (v) => {
                    "use server";
                    return submitClientReviewAction({ requestId: r.id, name: v.name, rating: v.rating, body: v.body });
                  }}
                />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
