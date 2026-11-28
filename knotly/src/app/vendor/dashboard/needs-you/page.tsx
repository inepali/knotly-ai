// Needs You: decisions your agent wants you to make, and posted projects you're answering by hand.
import Link from "next/link";
import { requireVendor } from "@/lib/vendor-session";
import EscalationCard from "@/components/vendor/EscalationCard";
import { panelClasses } from "@/components/ui/fields";
import PageLeads from "@/components/vendor/PageLeads";
import { listPageLeads } from "@/lib/page-leads";
import { supabaseAdmin } from "@/lib/supabase/admin";

type LeadThread = {
  id: string;
  created_at: string;
  messages: { body: string; sender: string; payload: { type?: string } | null; created_at: string }[];
};

export default async function NeedsYouPage() {
  const { sb, userId } = await requireVendor();
  // Leads from the public-page chat that waited for funds get paid for (and unlocked) once the
  // balance covers them: after a reload, the signup credit, or an admin credit.
  const { error: unlockError } = await supabaseAdmin.rpc("unlock_page_leads", { p_vendor: userId });
  if (unlockError) console.error("[needs-you] unlock page leads", unlockError.message);
  const [pageLeads, agentName] = await Promise.all([
    listPageLeads(sb),
    sb.rpc("vendor_agent_name", { v: userId }).then((r) => (typeof r.data === "string" && r.data) || "your assistant"),
  ]);

  const { data: items } = await sb
    .from("escalations")
    .select("id, thread_id, reason, decision, total, status, created_at")
    .neq("status", "resolved")
    .order("created_at");

  // Leads: posts where the agent isn't replying (paused), so the vendor answers by hand.
  const [{ data: msgs }, { data: leads }] = await Promise.all([
    // The couple's latest message for each escalation
    (items ?? []).length
      ? sb
          .from("messages")
          .select("thread_id, body, payload, sender, created_at")
          .in("thread_id", (items ?? []).map((e) => e.thread_id))
          .eq("status", "sent")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    sb
      .from("threads")
      .select("id, created_at, messages(body, sender, payload, created_at)")
      .eq("origin", "post")
      .eq("vendor_agent_paused", true)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const requestFor = (threadId: string) =>
    (msgs ?? []).find(
      (m) =>
        m.thread_id === threadId &&
        (m.sender === "couple" || m.sender === "couple_agent" || (m.payload as { type?: string } | null)?.type === "project_post")
    )?.body ?? "";

  const leadRows = ((leads ?? []) as unknown as LeadThread[]).map((t) => ({
    id: t.id,
    request: t.messages.find((m) => m.payload?.type === "project_post")?.body ?? "A couple posted their wedding.",
    at: t.created_at,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Needs You ({items?.length ?? 0})</h1>
      <p className="mt-1 text-sm text-gray-600">Things your agent wants you to decide.</p>

      <div className="mt-6 space-y-4">
        {!items?.length && <p className={`${panelClasses} p-6 text-sm text-gray-600`}>All clear. Your agent is handling everything.</p>}
        {items?.map((e) => (
          <EscalationCard key={e.id} esc={e} coupleMessage={requestFor(e.thread_id)} />
        ))}
      </div>

      {leadRows.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Leads you&apos;re answering yourself ({leadRows.length})</h2>
          <p className="mt-1 text-sm text-gray-600">Couples who posted their wedding while your agent&apos;s auto-reply is off for that conversation.</p>
          <ul className="mt-3 space-y-3">
            {leadRows.map((l) => (
              <li key={l.id} className={`${panelClasses} flex flex-wrap items-center justify-between gap-3 p-4 text-sm`}>
                <p className="max-w-xl text-gray-700">{l.request}</p>
                <Link href={`/inbox/${l.id}`} className="rounded-lg bg-cyan-500 px-3 py-2 font-semibold text-white hover:bg-cyan-600">
                  Reply
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PageLeads leads={pageLeads.ok ? pageLeads.data : []} agentName={agentName} />
    </div>
  );
}
