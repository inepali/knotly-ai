// src/agent/vendor/gate.ts
import type { Decision } from "./decide";
import type { VendorCtx } from "./context";
import type { Priced } from "./pricing";

const LEVEL_NEEDED = {
  answer: 1,
  clarify: 1,
  quote: 2,
  hold: 2,
  decline: 2,
  escalate: 99,
} as const;

export const REASONS: Record<string, string> = {
  agent_escalated: "The agent asked for your help",
  low_confidence: "The agent wasn't confident enough",
  autonomy_level: "Your autonomy level requires your approval for this",
  uncited: "The reply states facts without a source",
  human_claim: "The reply claimed to be a person",
  date_unavailable: "The date isn't open on your calendar",
  invalid_package: "The estimate didn't match a real package",
  custom_add_ons: "The couple asked for something custom",
  price_floor: "The estimate is below your price floor",
  discount_needs_level_3: "Discounts need autonomy level 3",
  max_discount: "The discount is above your maximum",
  service_area: "The wedding is outside your service area",
  always_review: 'This matches one of your "always review" rules',
  sensitive:
    "The message looks sensitive (refund, complaint, legal, or cancellation)",
};

export function gate(d: Decision, ctx: VendorCtx, priced: Priced | null) {
  const v: string[] = [];
  const level = ctx.settings.autonomy_level;
  const find = <K extends VendorCtx["rules"][number]["kind"]>(k: K) =>
    ctx.rules.find((r) => r.kind === k) as
      | Extract<VendorCtx["rules"][number], { kind: K }>
      | undefined;

  if (d.responseType === "escalate") v.push("agent_escalated");
  if (d.confidence < ctx.settings.confidence_threshold)
    v.push("low_confidence");
  if (level < LEVEL_NEEDED[d.responseType]) v.push("autonomy_level");
  if (["answer", "quote"].includes(d.responseType) && d.sources.length === 0)
    v.push("uncited");
  if (/\b(i am|i'm)\s+(a\s+)?(real\s+)?(human|person)\b/i.test(d.message))
    v.push("human_claim");

  if (["quote", "hold"].includes(d.responseType) && ctx.dateStatus !== "open")
    v.push("date_unavailable");

  if (d.responseType === "quote") {
    if (!priced) v.push("invalid_package");
    if (d.quote?.addOns.length) v.push("custom_add_ons");
    const floor = find("price_floor");
    if (priced && floor && priced.total < floor.amount) v.push("price_floor");
    const pct = d.quote?.discountPercent ?? 0;
    if (pct > 0 && level < 3) v.push("discount_needs_level_3");
    if (pct > (find("max_discount")?.percent ?? 0)) v.push("max_discount");
  }

  const radius = find("service_radius");
  if (
    radius &&
    ctx.distanceMiles != null &&
    ctx.distanceMiles > radius.miles &&
    d.responseType !== "decline"
  )
    v.push("service_area");

  const facts: Record<string, number | null> = {
    guest_count: ctx.wedding.guest_count,
    days_until_wedding: ctx.daysUntilWedding,
    budget_for_category: null,
  };
  for (const r of ctx.rules) {
    if (r.kind !== "always_review") continue;
    const x = facts[r.field];
    if (x != null && (r.op === ">" ? x > r.value : x < r.value)) {
      v.push("always_review");
      break;
    }
  }

  if (
    /\b(refund|lawyer|attorney|sue|complain|complaint|emergency|cancel)/i.test(
      ctx.lastCoupleMessage
    )
  )
    v.push("sensitive");

  return { pass: v.length === 0, violations: [...new Set(v)] };
}
