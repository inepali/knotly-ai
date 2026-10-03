// src/agent/vendor/act.ts
import "server-only";
import { supabaseAdmin as db } from "@/lib/supabase/admin";
import { notify } from "@/lib/email";
import { REASONS } from "./gate";
import type { Decision } from "./decide";
import type { VendorCtx } from "./context";
import type { Priced } from "./pricing";

const APP = process.env.APP_URL;
const emailOf = async (id: string) =>
  (await db.from("profiles").select("email").eq("id", id).single()).data
    ?.email ?? "";
const coupleOf = async (threadId: string) =>
  (
    await db
      .from("threads")
      .select("couple_projects(couple_id)")
      .eq("id", threadId)
      .single()
  ).data as any;

// Send the decision for real
export async function act(
  d: Decision,
  ctx: VendorCtx,
  priced: Priced | null,
  message = d.message
) {
  let body = message,
    payload: Record<string, unknown> = { responseType: d.responseType };

  if (d.responseType === "quote" && priced) {
    const validUntil = new Date(
      Date.now() + ctx.settings.quote_valid_days * 86_400_000
    )
      .toISOString()
      .slice(0, 10);
    const { data: q } = await db
      .from("quotes")
      .insert({
        thread_id: ctx.threadId,
        package_id: priced.packageId,
        line_items: priced.lines,
        total: priced.total,
        valid_until: validUntil,
      })
      .select("id")
      .single();
    payload.quoteId = q!.id;
    // The couple sees the price when they open the estimate (that's when credits are charged, Lesson 17)
    body +=
      `\n\nI've prepared an estimate for you, valid until ${validUntil}. Tap "Review estimate" to see it. ` +
      `Estimates are confirmed in your contract.`;
    await db
      .from("threads")
      .update({ status: "quoted" })
      .eq("id", ctx.threadId);
    // Vendor always gets a copy of estimates their agent sends
    await notify(
      await emailOf(ctx.vendor.id),
      `Your agent sent an estimate: $${priced.total}`,
      body,
      `${APP}/vendor/leads/${ctx.threadId}`
    );
  }
  if (d.responseType === "hold" && ctx.wedding.wedding_date) {
    await db.from("vendor_availability").insert({
      vendor_id: ctx.vendor.id,
      date: ctx.wedding.wedding_date,
      status: "held",
      thread_id: ctx.threadId,
      hold_expires_at: new Date(
        Date.now() + ctx.settings.hold_days * 86_400_000
      ).toISOString(),
    });
    await db.from("threads").update({ status: "held" }).eq("id", ctx.threadId);
  }
  if (d.responseType === "decline")
    await db
      .from("threads")
      .update({ status: "declined" })
      .eq("id", ctx.threadId);

  await db
    .from("messages")
    .insert({
      thread_id: ctx.threadId,
      sender: "vendor_agent",
      status: "sent",
      body,
      payload,
    });
  const couple = await coupleOf(ctx.threadId);
  await notify(
    await emailOf(couple.couple_projects.couple_id),
    `New reply from ${ctx.vendor.business_name}`,
    `${ctx.vendor.business_name} replied to your inquiry.`,
    `${APP}/chat`
  );
}

// Hand it to the human vendor
export async function escalate(
  d: Decision,
  ctx: VendorCtx,
  priced: Priced | null,
  violations: string[]
) {
  const reason = violations.map((x) => REASONS[x] ?? x).join("; ");
  await db.from("escalations").insert({
    thread_id: ctx.threadId,
    vendor_id: ctx.vendor.id,
    violations,
    reason,
    decision: d,
    total: priced?.total ?? null,
    due_at: new Date(Date.now() + 2 * 3_600_000).toISOString(), // remind after 2h (Lesson 16)
  });
  await notify(
    await emailOf(ctx.vendor.id),
    "Your Knotly agent needs you",
    `Reason: ${reason}. It drafted a reply for you to approve, edit, or reject.`,
    `${APP}/vendor/inbox`
  );
}
