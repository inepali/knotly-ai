// My Wedding: the form, and "Post to vendors".
import { requireCouple } from "@/lib/couple-session";
import { getProject } from "@/lib/actions/wedding";
import WeddingForm, { type WeddingFormInitial } from "@/components/dashboard/WeddingForm";
import { CATEGORY_SLUGS } from "@/lib/categories";

// Posting starts the vendor agents in the background (after the response); allow them time.
export const maxDuration = 300;

type Param = string | string[] | undefined;
const one = (p: Param) => (Array.isArray(p) ? p[0] : p);

// ?metro=charlotte-nc&need=photographer comes from a public listing page via sign-up. It only fills
// blanks on screen; nothing is saved until the couple saves or posts.
export default async function MyWeddingPage({ searchParams }: { searchParams: Promise<{ metro?: Param; need?: Param }> }) {
  const { sb, userId } = await requireCouple();
  const prefill = await searchParams;
  const [project, { data: metros }] = await Promise.all([
    getProject(sb, userId),
    sb.from("metros").select("slug, name, state").order("name"),
  ]);
  const { data: needs } = project
    ? await sb.from("project_needs").select("category, budget, service_hours").eq("project_id", project.id)
    : { data: [] };

  const initial: WeddingFormInitial = {
    partnerNames: project?.partner_names ?? "",
    weddingDate: project?.wedding_date ?? "",
    metro: project?.metro_slug ?? "",
    venue: project?.venue ?? "",
    guestCount: project?.guest_count ?? null,
    budgetTotal: project?.budget_total ?? null,
    style: project?.style ?? "",
    loveStory: project?.love_story ?? "",
    projectDetails: project?.project_details ?? "",
    needs: (needs ?? []).map((n: { category: string; budget: number | null; service_hours: number | null }) => ({
      category: n.category,
      budget: n.budget,
      hours: n.service_hours,
    })),
    postedAt: project?.posted_at ?? null,
  };

  const metroParam = one(prefill.metro);
  if (!initial.metro && metroParam && (metros ?? []).some((m: { slug: string }) => m.slug === metroParam)) initial.metro = metroParam;
  const needParam = one(prefill.need);
  if (needParam && (CATEGORY_SLUGS as readonly string[]).includes(needParam) && !initial.needs.some((n) => n.category === needParam)) {
    initial.needs.push({ category: needParam, budget: null, hours: null });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">My Wedding</h1>
      <p className="mt-1 text-sm text-gray-600">
        Fill in what you know; every field is optional and saves as you go. When you&apos;re ready, post to vendors and
        the ones who are free and fit your budget will send you estimates.
      </p>
      <WeddingForm initial={initial} metros={metros ?? []} />
    </div>
  );
}
