// Agent Settings: how independently your agent works, the rules it follows, and how it's doing.
import { requireVendor } from "@/lib/vendor-session";
import { getAgentStats, listRules } from "@/lib/actions/vendor-agent-settings";
import AgentSettings, { type RuleRow } from "@/components/dashboard/AgentSettings";

export default async function AgentPage() {
  const { sb, userId } = await requireVendor();
  const [rules, stats] = await Promise.all([listRules(sb, userId), getAgentStats(sb, userId)]);
  const r = rules.ok ? rules.data : { rules: [], settings: null };
  const s = stats.ok ? stats.data : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Agent Settings</h1>
      <p className="mt-1 text-sm text-gray-600">
        Your agent answers couples for you within the limits you set here. Anything outside them comes to Needs You.
      </p>
      <AgentSettings
        level={r.settings?.autonomy_level ?? 0}
        rules={(r.rules ?? []) as RuleRow[]}
        notes={r.settings?.agent_custom_instructions ?? null}
        notesUpdatedAt={r.settings?.agent_custom_instructions_updated_at ?? null}
        stats={
          s && {
            sentAlone: s.sent_alone ?? 0,
            escalated: s.escalated ?? 0,
            approvedAsIs: s.approved_as_is ?? 0,
            changedByHuman: s.changed_by_human ?? 0,
            approvalRate: s.approvalRate,
            suggestion: s.suggestion,
          }
        }
      />
    </div>
  );
}
