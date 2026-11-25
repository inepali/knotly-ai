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
