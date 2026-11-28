// src/lib/actions/posting.ts — "Post to vendors": match vendors in SQL, then ask them in
// waves so tokens are only spent on vendors whose estimates the couple can actually see.
//
//   postProject            validate, stamp posted_at, queue matched vendors, start the first wave
//   requestMoreEstimates   "Get 5 more estimates" for one category
//   advanceWaves           ask the next queued vendors until each category hits its cap
//   estimateProgress       per-category counts for the Estimates page
//
// Reads and ownership checks use the couple's client (RLS). Creating other people's threads
// and messages needs the service role, so the fan-out uses supabaseAdmin after ownership is proven.
import { z } from "zod";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runVendorAgent } from "@/agent/vendor/responder";
import { Category } from "@/agent/shared";
import { categoryLabel } from "@/lib/categories";
import { waveSize, weightedShuffle } from "@/lib/matching";
import { getProject } from "./wedding";
import { fail, ok, parseInput, type Sb } from "./result";

export const MORE_ESTIMATES_STEP = 5;
export const MAX_ESTIMATE_CAP = 50;
const MAX_ROUNDS = 8; // safety stop for one advanceWaves call

export const RequestMoreEstimatesInput = z.object({ category: Category });
export type RequestMoreEstimatesInput = z.input<typeof RequestMoreEstimatesInput>;

type ProjectRow = {
  id: string;
  wedding_date: string | null;
  metro_slug: string | null;
  guest_count: number | null;
  budget_total: number | null;
  style: string | null;
  love_story?: string | null;
  project_details?: string | null;
  posted_at: string | null;
};

type NeedRow = { category: string; budget: number | null; estimate_cap: number; service_hours?: number | null };

type PostThread = {
  id: string;
  vendor_id?: string;
  status: string;
  queue_rank: number | null;
  vendors: { category: string } | null;
  quotes: { id: string }[];
};

const metroName = (slug: string) =>
  slug
    .replace(/-([a-z]{2})$/, (_, st: string) => `, ${st.toUpperCase()}`)
    .replace(/(^|[s-])([a-z])/g, (_, a: string, b: string) => a.replace("-", " ") + b.toUpperCase());

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** The plain-language summary vendors (and their agent) read. No AI involved. */
export function projectPostBody(p: ProjectRow, need: NeedRow) {
  const when = p.wedding_date
    ? new Date(`${p.wedding_date}T12:00:00`).toLocaleDateString("en-US", { dateStyle: "long" })
    : "a date to be set";
  const budget = need.budget ?? p.budget_total;
  return [
    `A couple is planning a wedding on ${when}${p.metro_slug ? ` near ${metroName(p.metro_slug)}` : ""}` +
      `${p.guest_count ? ` for about ${p.guest_count} guests` : ""}${p.style ? ` (style: ${p.style})` : ""}.`,
    `They're looking for a ${categoryLabel(need.category).toLowerCase()}` +
      `${need.service_hours ? ` for about ${need.service_hours} hour${need.service_hours === 1 ? "" : "s"} of service` : ""}` +
      `${budget ? ` and have ${usd(budget)} in mind${need.budget ? " for this" : " in total for the wedding"}` : ""}.`,
    ...(p.love_story?.trim() ? [`Their story: ${p.love_story.trim()}`] : []),
    ...(p.project_details?.trim() ? [`Details and expectations: ${p.project_details.trim()}`] : []),
    "Please send an estimate if you're available.",
  ].join(" ");
}

/** Match vendors for one category and queue them in weighted-random order. Returns how many. */
async function queueMatches(project: ProjectRow, category: string) {
  const db = supabaseAdmin;
  const { data: matches, error } = await db.rpc("match_project_vendors", {
    p_project: project.id,
    p_category: category,
  });
  if (error) return { error: error.message, queued: 0 };
  const vendorIds = ((matches ?? []) as { vendor_id: string }[]).map((m) => m.vendor_id);
  if (!vendorIds.length) return { error: null, queued: 0 };

  const { data: last } = await db
    .from("threads")
    .select("queue_rank")
    .eq("project_id", project.id)
    .eq("origin", "post")
    .order("queue_rank", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const start = (last?.queue_rank ?? 0) + 1;

  // Equal weights until billing exists; then pass a weight that gives Pro vendors PRO_WEIGHT.
  const ordered = weightedShuffle(vendorIds);
  const { error: insertError } = await db.from("threads").upsert(
    ordered.map((vendor_id, i) => ({
      project_id: project.id,
      vendor_id,
      status: "queued",
      origin: "post",
      queue_rank: start + i,
    })),
    { onConflict: "project_id,vendor_id", ignoreDuplicates: true }
  );
  return { error: insertError?.message ?? null, queued: ordered.length };
}

export async function postProject(sb: Sb, userId: string) {
  const project = (await getProject(sb, userId)) as ProjectRow | null;
  if (!project) return fail("Save your wedding details first.");

  const { data: needs } = await sb
    .from("project_needs")
    .select("category, budget, estimate_cap, service_hours")
    .eq("project_id", project.id);
  const missing = [
    !project.wedding_date && "your wedding date",
    !project.metro_slug && "your city",
    !(needs ?? []).length && "at least one vendor type you need",
  ].filter(Boolean) as string[];
  if (missing.length) return fail(`Add ${missing.join(", ")} before posting.`);

  // First post: match every need. After that, only needs that have no vendors queued yet
  // (categories added since), so edits don't re-ask anyone.
  const first = !project.posted_at;
  let toMatch = (needs as NeedRow[]).map((n) => n.category);
  if (!first) {
    const { data: threads } = await supabaseAdmin
      .from("threads")
      .select("vendors(category)")
      .eq("project_id", project.id)
      .eq("origin", "post");
    const have = new Set(
      ((threads ?? []) as unknown as { vendors: { category: string } | null }[]).map((t) => t.vendors?.category)
    );
    toMatch = toMatch.filter((c) => !have.has(c));
  }

  if (first) {
    const { error } = await sb
      .from("couple_projects")
      .update({ posted_at: new Date().toISOString() })
      .eq("id", project.id);
    if (error) return fail(error.message);
  }

  const queued: Record<string, number> = {};
  for (const category of toMatch) {
    const r = await queueMatches(project, category);
    if (r.error) return fail(r.error);
    queued[category] = r.queued;
  }

  after(() => advanceWaves(project.id));
  return ok({ firstPost: first, matched: queued });
}

export async function requestMoreEstimates(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(RequestMoreEstimatesInput, input);
  if (!p.ok) return p;
  const project = await getProject(sb, userId);
  if (!project) return fail("Save your wedding details first.");

  const { data: need } = await sb
    .from("project_needs")
    .select("estimate_cap")
    .eq("project_id", project.id)
    .eq("category", p.data.category)
    .maybeSingle();
  if (!need) return fail("That isn't one of the vendor types you need.");

  const cap = Math.min(MAX_ESTIMATE_CAP, need.estimate_cap + MORE_ESTIMATES_STEP);
  const { error } = await sb
    .from("project_needs")
    .update({ estimate_cap: cap })
    .eq("project_id", project.id)
    .eq("category", p.data.category);
  if (error) return fail(error.message);

  after(() => advanceWaves(project.id));
  return ok({ category: p.data.category, cap });
}

/** Pay as you go needs the $1 lead fee available; Basic/Pro always can. Unknown (RPC error) → yes:
 * the estimate itself still can't be created without the fee (quotes trigger). */
async function canTakeLead(vendorId: string) {
  const { data } = await supabaseAdmin.rpc("vendor_can_take_lead", { v: vendorId });
  return data !== false;
}

/** Per-category counts for a project, read with the service role (the couple can't see queued vendors). */
async function loadCategoryState(projectId: string) {
  const db = supabaseAdmin;
  const [{ data: needs }, { data: threads }] = await Promise.all([
    db.from("project_needs").select("category, budget, estimate_cap, service_hours").eq("project_id", projectId),
    db
      .from("threads")
      .select("id, vendor_id, status, queue_rank, vendors(category), quotes(id)")
      .eq("project_id", projectId)
      .eq("origin", "post"),
  ]);
  const all = (threads ?? []) as unknown as PostThread[];
  return ((needs ?? []) as NeedRow[]).map((n) => {
    const mine = all.filter((t) => t.vendors?.category === n.category);
    return {
      need: n,
      estimates: mine.filter((t) => t.quotes.length > 0).length,
      inFlight: mine.filter((t) => t.status === "open" && t.quotes.length === 0).length,
      queued: mine
        .filter((t) => t.status === "queued")
        .sort((a, b) => (a.queue_rank ?? 0) - (b.queue_rank ?? 0)),
    };
  });
}

/**
 * Ask the next queued vendors, category by category, until each has its cap of estimates
 * or runs out of matches. Declines free their slot, so the loop keeps going until a round
 * asks nobody. Safe to call repeatedly (post, "get more", cron): a thread is claimed with
 * a conditional update so it's never asked twice.
 */
export async function advanceWaves(projectId: string) {
  const db = supabaseAdmin;
  const { data: project } = await db
    .from("couple_projects")
    .select("id, wedding_date, metro_slug, guest_count, budget_total, style, love_story, project_details, posted_at")
    .eq("id", projectId)
    .single();
  if (!project?.posted_at) return { asked: 0 };

  let asked = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const state = await loadCategoryState(projectId);
    const claimed: { id: string; need: NeedRow }[] = [];

    for (const s of state) {
      let n = waveSize(s.need.estimate_cap, s.estimates, s.inFlight, s.queued.length);
      for (const t of s.queued) {
        if (n <= 0) break;
        // Matching already skips vendors who can't cover the $1 lead fee, but a wave can come
        // days later. Skip them now and ask the next in line, so the couple isn't kept waiting.
        if (t.vendor_id && !(await canTakeLead(t.vendor_id))) {
          await db.from("threads").update({ status: "skipped" }).eq("id", t.id).eq("status", "queued");
          continue;
        }
        n--;
        const { data } = await db
          .from("threads")
          .update({ status: "open" })
          .eq("id", t.id)
          .eq("status", "queued")
          .select("id");
        if (!data?.length) continue; // someone else got it
        await db.from("messages").insert({
          thread_id: t.id,
          sender: "system",
          status: "sent",
          body: projectPostBody(project as ProjectRow, s.need),
          payload: {
            type: "project_post",
            category: s.need.category,
            weddingDate: project.wedding_date,
            metro: project.metro_slug,
            guestCount: project.guest_count,
            style: project.style,
            budget: s.need.budget ?? project.budget_total,
          },
        });
        claimed.push({ id: t.id, need: s.need });
      }
    }
    if (!claimed.length) break;
    asked += claimed.length;

    // Run the vendors' agents side by side; a failure frees that slot instead of stalling the wave.
    await Promise.all(
      claimed.map(async ({ id }) => {
        try {
          await runVendorAgent(id);
        } catch (e) {
          console.error("[posting] vendor agent failed", id, e instanceof Error ? e.message : e);
          await db.from("threads").update({ status: "failed" }).eq("id", id).eq("status", "open");
        }
      })
    );
  }
  return { asked };
}

/** Everything the Estimates page needs about progress, per needed category. */
export async function estimateProgress(sb: Sb, userId: string) {
  const project = await getProject(sb, userId);
  if (!project) return ok({ posted: false, categories: [] });
  const state = await loadCategoryState(project.id);
  return ok({
    posted: !!project.posted_at,
    categories: state.map((s) => ({
      category: s.need.category,
      cap: s.need.estimate_cap,
      estimates: s.estimates,
      waiting: s.inFlight,
      // vendors still to ask: more estimates can come
      remaining: s.queued.length,
    })),
  });
}
