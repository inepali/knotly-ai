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
      .order("created_at")
      .limit(20),
    db
      .from("couple_projects")
      .select("wedding_date, metro_slug, guest_count, budget_total, style")
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
  const lastCoupleMessage =
    [...(msgs.data ?? [])].reverse().find((m) => m.sender.startsWith("couple"))
      ?.body ?? "";
  // What the vendor taught their assistant (site, FAQs, PDFs) that bears on this message.
  const knowledge = await searchKnowledge(vid, lastCoupleMessage);

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
    history: (msgs.data ?? []).map((m) => ({ from: m.sender, text: m.body })),
    lastCoupleMessage,
    knowledge,
  };
}
export type VendorCtx = NonNullable<Awaited<ReturnType<typeof loadVendorCtx>>>;
