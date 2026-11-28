// Agent Settings: how independently your agent works, the rules it follows, and how it's doing.
import { requireVendor } from "@/lib/vendor-session";
import { getAgentStats, listRules } from "@/lib/actions/vendor-agent-settings";
import AgentSettings, { type RuleRow } from "@/components/dashboard/AgentSettings";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { vendorPath } from "@/lib/vendor-seo";

// Chats and leads from the public page since the 1st of this month.
async function chatStats(sb: Awaited<ReturnType<typeof requireVendor>>["sb"], userId: string) {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  const [{ count: chats }, { data: leads }, { data: vendor }] = await Promise.all([
    // Visitors' chats aren't readable by the vendor directly (RLS); counting them is server-side only.
    supabaseAdmin.from("vendor_chat_sessions").select("id", { count: "exact", head: true }).eq("vendor_id", userId).gte("created_at", since.toISOString()),
    sb.rpc("vendor_page_leads", { p_limit: 200 }),
    sb.from("vendors").select("business_name, slug, category, metro_slug, published").eq("id", userId).maybeSingle(),
  ]);
  const leadsThisMonth = ((leads ?? []) as { created_at: string }[]).filter((l) => l.created_at >= since.toISOString()).length;
  return { chats: chats ?? 0, leadsThisMonth, vendor };
}

export default async function AgentPage() {
  const { sb, userId } = await requireVendor();
  const [rules, stats, chat] = await Promise.all([listRules(sb, userId), getAgentStats(sb, userId), chatStats(sb, userId)]);
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
        identity={{
          name: r.settings?.agent_display_name ?? null,
          enabled: r.settings?.public_chat_enabled ?? true,
          businessName: chat.vendor?.business_name ?? "your business",
          publicPath: chat.vendor?.published ? vendorPath(chat.vendor) : null,
          chatsThisMonth: chat.chats,
          leadsThisMonth: chat.leadsThisMonth,
        }}
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
