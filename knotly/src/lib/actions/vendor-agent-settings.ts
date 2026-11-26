// src/lib/actions/vendor-agent-settings.ts — the Vendor Agent's rules, autonomy and stats
// (shared by chat tools and forms).
import { z } from "zod";
import { RuleSchema } from "@/agent/vendor/rules";
import { fail, ok, parseInput, type Sb } from "./result";

export const SaveRuleInput = z.object({
  rule: RuleSchema,
  sourceText: z.string().describe("The vendor's own words for this rule"),
});
export type SaveRuleInput = z.input<typeof SaveRuleInput>;

export const SetAutonomyInput = z.object({ level: z.number().int().min(0).max(3) });
export type SetAutonomyInput = z.input<typeof SetAutonomyInput>;

export async function saveRule(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveRuleInput, input);
  if (!p.ok) return p;
  const { rule, sourceText } = p.data;

  const { kind, ...params } = rule;
  // One active rule per kind (except blackout / always_review, which can repeat)
  if (!["blackout_weekday", "always_review"].includes(kind)) {
    await sb.from("vendor_agent_rules").update({ active: false }).eq("vendor_id", userId).eq("kind", kind);
  }
  const { data, error } = await sb
    .from("vendor_agent_rules")
    .insert({ vendor_id: userId, kind, params, source_text: sourceText })
    .select("id, kind, params")
    .single();
  if (error?.message.includes("vendor_agent_rules_vendor_id_fkey")) {
    return fail("Save your Business profile first (Business page), then add rules.");
  }
  return error ? fail(error.message) : ok({ saved: data });
}

export async function listRules(sb: Sb, userId: string) {
  const [{ data: rules }, { data: settings }] = await Promise.all([
    sb.from("vendor_agent_rules").select("id, kind, params, source_text").eq("vendor_id", userId).eq("active", true),
    sb.from("vendor_agent_settings").select("*").eq("vendor_id", userId).single(),
  ]);
  return ok({ rules, settings });
}

export async function setAutonomy(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SetAutonomyInput, input);
  if (!p.ok) return p;
  const { level } = p.data;

  const { error } = await sb.from("vendor_agent_settings").update({ autonomy_level: level }).eq("vendor_id", userId);
  return error ? fail(error.message) : ok({ level });
}

export async function getAgentStats(sb: Sb, userId: string) {
  const [{ data: s }, { data: st }] = await Promise.all([
    sb.from("vendor_agent_stats").select("*").eq("vendor_id", userId).maybeSingle(),
    sb.from("vendor_agent_settings").select("autonomy_level").eq("vendor_id", userId).single(),
  ]);
  const approved = s?.approved_as_is ?? 0,
    changed = s?.changed_by_human ?? 0;
  const approvalRate = approved + changed ? approved / (approved + changed) : null;
  return ok({
    ...s,
    level: st?.autonomy_level,
    approvalRate,
    suggestion:
      approved >= 20 && (approvalRate ?? 0) >= 0.9 && (st?.autonomy_level ?? 0) < 2
        ? "You approved 90%+ of drafts unchanged. Consider Autopilot (level 2)."
        : null,
  });
}

export const RemoveRuleInput = z.object({ id: z.uuid("That rule doesn't exist.") });
export type RemoveRuleInput = z.input<typeof RemoveRuleInput>;

/** Turn a rule off. It's kept (inactive) so the agent's past decisions can still be explained. */
export async function removeRule(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(RemoveRuleInput, input);
  if (!p.ok) return p;
  const { data, error } = await sb
    .from("vendor_agent_rules")
    .update({ active: false })
    .eq("id", p.data.id)
    .eq("vendor_id", userId)
    .select("id");
  if (error) return fail(error.message);
  if (!data?.length) return fail("Rule not found.");
  return ok({ removed: p.data.id });
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** One plain-English line for a saved rule (kind + params as stored). */
export function describeRule(kind: string, params: Record<string, unknown>): string {
  const n = (k: string) => Number(params[k]);
  switch (kind) {
    case "price_floor":
      return `Never quote less than $${n("amount").toLocaleString("en-US")}`;
    case "max_discount":
      return `Discount at most ${n("percent")}%`;
    case "capacity_per_day":
      return `Take at most ${n("max")} wedding${n("max") === 1 ? "" : "s"} per day`;
    case "blackout_weekday": {
      const months = Array.isArray(params.months)
        ? (params.months as number[]).map((m) => MONTHS[m - 1]).join(", ")
        : "";
      return `Never available on ${WEEKDAYS[n("weekday")] ?? "?"}s${months ? ` in ${months}` : ""}`;
    }
    case "service_radius":
      return `Only travel within ${n("miles")} miles`;
    case "always_review": {
      const field = {
        guest_count: "guest count",
        days_until_wedding: "days until the wedding",
        budget_for_category: "budget for my category",
      }[String(params.field)];
      return `Ask me first when ${field ?? params.field} is ${params.op === ">" ? "over" : "under"} ${Number(params.value).toLocaleString("en-US")}`;
    }
    default:
      return kind;
  }
}
