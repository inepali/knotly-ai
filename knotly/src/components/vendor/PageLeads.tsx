// src/components/vendor/PageLeads.tsx — leads from the "Talk to …" chat on the vendor's public page.
// Locked leads (the balance couldn't cover the lead fee) hide contact details until a reload.
"use client";
import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { panelClasses } from "@/components/ui/fields";
import { useAction } from "@/components/dashboard/useAction";
import { pageLeadTranscriptAction, setPageLeadStatusAction } from "@/app/vendor/dashboard/actions";
import type { PageLead } from "@/lib/page-leads";

const STATUS: Record<PageLead["status"], { label: string; tone: string }> = {
  locked: { label: "Locked", tone: "bg-amber-100 text-amber-900" },
  flagged: { label: "Unverified · free", tone: "bg-gray-100 text-gray-700" },
  new: { label: "New", tone: "bg-cyan-100 text-cyan-900" },
  contacted: { label: "Contacted", tone: "bg-violet-100 text-violet-900" },
  converted: { label: "Booked", tone: "bg-emerald-100 text-emerald-900" },
  spam: { label: "Spam", tone: "bg-red-100 text-red-900" },
};

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Date not set";

export default function PageLeads({ leads, agentName }: { leads: PageLead[]; agentName: string }) {
  if (!leads.length) return null;
  const locked = leads.filter((l) => l.status === "locked").length;
  return (
    <section id="page-leads" className="mt-10">
      <h2 className="text-lg font-semibold">Leads from your page ({leads.length})</h2>
      <p className="mt-1 text-sm text-gray-600">Couples who chatted with {agentName} on your public page and sent their details.</p>
      {locked > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {locked} lead{locked === 1 ? " is" : "s are"} waiting: your balance is under the lead fee.{" "}
          <Link href="/vendor/dashboard/account" className="font-semibold underline">
            Reload to see {locked === 1 ? "it" : "them"} →
          </Link>
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {leads.map((l) => (
          <LeadRow key={l.id} lead={l} agentName={agentName} />
        ))}
      </ul>
    </section>
  );
}

function LeadRow({ lead: l, agentName }: { lead: PageLead; agentName: string }) {
  const act = useAction();
  const [chat, setChat] = useState<{ role: string; body: string }[] | null>(null);
  const [chatError, setChatError] = useState("");
  const s = STATUS[l.status];
  const isLocked = l.status === "locked";

  async function toggleChat() {
    if (chat) return setChat(null);
    const r = await pageLeadTranscriptAction(l.id);
    if (r.ok) setChat(r.messages);
    else setChatError(r.error);
  }

  return (
    <li className={`${panelClasses} p-4 text-sm`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">
            {isLocked ? "A couple" : l.name} · {fmtDate(l.wedding_date)}
          </p>
          <p className="text-xs text-gray-500">
            {new Date(l.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            {l.fee_cents ? ` · $${(l.fee_cents / 100).toFixed(2)}` : " · free"}
            {l.couple_signed_up && " · has a Knotly account"}
          </p>
        </div>
        <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", s.tone)}>{s.label}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-gray-800">&ldquo;{l.need}&rdquo;</p>

      {isLocked ? (
        <p className="mt-2 text-gray-600">Reload your balance to see their name, email and phone.</p>
      ) : (
        <>
          <ul className="mt-2 space-y-0.5 text-gray-700">
            {l.email && (
              <li>
                Email: <a className="text-cyan-700 underline" href={`mailto:${l.email}`}>{l.email}</a>
              </li>
            )}
            {l.phone && (
              <li>
                Phone: <a className="text-cyan-700 underline" href={`tel:${l.phone}`}>{l.phone}</a>
              </li>
            )}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {l.thread_id && (
              <Link href={`/inbox/${l.thread_id}`} className="rounded-lg bg-cyan-500 px-3 py-1.5 font-semibold text-white hover:bg-cyan-600">
                Reply in Messages
              </Link>
            )}
            {(["contacted", "converted", "spam"] as const)
              .filter((st) => st !== l.status)
              .map((st) => (
                <button
                  key={st}
                  type="button"
                  disabled={act.pending}
                  onClick={() =>
                    act.run(
                      () => setPageLeadStatusAction({ id: l.id, status: st }),
                      undefined,
                      (r) =>
                        "creditedCents" in r && r.creditedCents
                          ? `Marked as spam. $${(r.creditedCents / 100).toFixed(2)} is back in your balance.`
                          : ""
                    )
                  }
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-gray-700 hover:border-gray-400 disabled:opacity-50"
                >
                  {st === "contacted" ? "Mark contacted" : st === "converted" ? "Mark booked" : "Spam"}
                </button>
              ))}
            <button type="button" onClick={toggleChat} className="text-cyan-700 underline">
              {chat ? "Hide chat" : `See the chat with ${agentName}`}
            </button>
          </div>
        </>
      )}
      {act.error && (
        <p role="alert" className="mt-2 text-red-600">
          {act.error}
        </p>
      )}
      {act.notice && (
        <p role="status" className="mt-2 text-emerald-700">
          {act.notice}
        </p>
      )}
      {chatError && <p className="mt-2 text-red-600">{chatError}</p>}
      {chat && (
        <ol className="mt-3 space-y-1.5 rounded-lg bg-gray-50 p-3 text-xs">
          {chat.map((m, i) => (
            <li key={i}>
              <span className="font-semibold">{m.role === "visitor" ? "Couple" : agentName}:</span> {m.body}
            </li>
          ))}
          {!chat.length && <li className="text-gray-500">They sent their details without chatting.</li>}
        </ol>
      )}
    </li>
  );
}
