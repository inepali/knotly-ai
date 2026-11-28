// src/agent/vendor/context.ts
import "server-only";
import { supabaseAdmin as db } from "@/lib/supabase/admin";
import {
  RuleSchema,
  dateStatus,
  milesBetween,
  type Rule,
  type Booking,
} from "./rules";
import { searchKnowledge } from "@/lib/knowledge";

export async function loadVendorCtx(threadId: string) {
  const { data: thread } = await db
    .from("threads")
    .select("id, vendor_id, project_id, status, vendor_agent_paused")
    .eq("id", threadId)
    .single();
  if (!thread) return null;
  const vid = thread.vendor_id;

  const [
    vendor,
    settings,
    ruleRows,
    packages,
    addOns,
    bookings,
    msgs,
    project,
  ] = await Promise.all([
    db
      .from("vendors")
      .select("id, business_name, category, bio, metro_slug, price_min")
      .eq("id", vid)
      .single(),
    db.from("vendor_agent_settings").select("*").eq("vendor_id", vid).single(),
    db
      .from("vendor_agent_rules")
      .select("kind, params")
      .eq("vendor_id", vid)
      .eq("active", true),
    db
      .from("vendor_packages")
      .select("id, name, description, price, inclusions")
      .eq("vendor_id", vid),
    db
      .from("vendor_addons")
      .select("id, name, description, price")
      .eq("vendor_id", vid),
    db
      .from("vendor_availability")
      .select("date, status, hold_expires_at")
      .eq("vendor_id", vid),
    db
      .from("messages")
      .select("sender, body, payload, created_at")
      .eq("thread_id", threadId)
      .eq("status", "sent")
      // Newest 20 (reversed below), so long threads keep the latest message.
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("couple_projects")
      .select("partner_names, venue, wedding_date, metro_slug, guest_count, budget_total, style")
      .eq("id", thread.project_id)
      .single(),
  ]);

  const rules: Rule[] = (ruleRows.data ?? [])
    .map((r) => RuleSchema.safeParse({ kind: r.kind, ...r.params }))
    .filter((r) => r.success)
    .map((r) => r.data!);

  const { data: metros } = await db
    .from("metros")
    .select("slug, lat, lng")
    .in(
      "slug",
      [vendor.data?.metro_slug, project.data?.metro_slug].filter(
        Boolean
      ) as string[]
    );
  const at = (slug?: string | null) => metros?.find((m) => m.slug === slug);
  const from = at(vendor.data?.metro_slug),
    to = at(project.data?.metro_slug);

  const wedding = project.data!;
  const history = [...(msgs.data ?? [])].reverse(); // oldest first
  const fromCouple = (m: (typeof history)[number]) =>
    m.sender.startsWith("couple") ||
    (m.payload as { type?: string } | null)?.type === "project_post";
  // A posted project arrives as a system "project_post" message instead of a couple's inquiry.
  const lastCoupleMessage = [...history].reverse().find(fromCouple)?.body ?? "";
  // What the couple set for this vendor's category: budget, must-haves, notes.
  const { data: need } = await db
    .from("project_needs")
    .select("budget, must_haves, notes")
    .eq("project_id", thread.project_id)
    .eq("category", vendor.data?.category ?? "")
    .maybeSingle();

  // What the vendor taught their assistant (site, FAQs, PDFs) that bears on this message. Search with the
  // last two couple messages so follow-ups ("and for that one?") still find the right excerpts.
  // Always this vendor only: match_vendor_knowledge filters on vendor_id.
  const query = history.filter(fromCouple).slice(-2).map((m) => m.body).join("\n");
  const knowledge = (await searchKnowledge(vid, query)).sort(
    (a, b) => Number(b.kind === "faq") - Number(a.kind === "faq")
  );

  if (process.env.AGENT_KILL_SWITCH === "1") settings.data!.autonomy_level = 0;

  return {
    threadId,
    paused: thread.vendor_agent_paused,
    vendor: vendor.data!,
    settings: settings.data!,
    rules,
    packages: packages.data ?? [],
    addOns: addOns.data ?? [],
    wedding,
    dateStatus: dateStatus(
      wedding.wedding_date,
      (bookings.data ?? []) as Booking[],
      rules
    ),
    distanceMiles: from && to ? Math.round(milesBetween(from, to)) : null,
    daysUntilWedding: wedding.wedding_date
      ? Math.round(
          (new Date(wedding.wedding_date).getTime() - Date.now()) / 86_400_000
        )
      : null,
    categoryBudget: need?.budget ?? null,
    categoryNeed: need ? { mustHaves: need.must_haves, notes: need.notes } : null,
    history: history.map((m) => ({ from: m.sender, text: m.body })),
    lastCoupleMessage,
    knowledge,
  };
}
export type VendorCtx = NonNullable<Awaited<ReturnType<typeof loadVendorCtx>>>;
