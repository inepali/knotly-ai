// src/components/invitations/InvitationsEditor.tsx — design a save-the-date or invitation, preview
// the email, pick households and send; or open print-ready cards.
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { useAction } from "@/components/dashboard/useAction";
import { saveDesignAction, sendInvitationsAction } from "@/app/client/dashboard/actions";
import { cardLinkPreview } from "./links";
import { invitationEmail, KIND_LABELS, MAX_SENDS_PER_KIND, TEMPLATES, type Design, type Kind, type Template } from "@/lib/invitations";
import type { InvitationsData } from "@/lib/actions/invitations";

export default function InvitationsEditor({ data, baseUrl }: { data: InvitationsData; baseUrl: string }) {
  const [kind, setKind] = useState<Kind>("save_the_date");
  return (
    <div className="mt-6 space-y-6">
      {!data.site?.published && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The button in each email opens your wedding website. <Link href="/client/dashboard/website" className="underline">Publish your website</Link> before sending.
        </p>
      )}
      <div role="tablist" className="flex gap-2">
        {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} type="button" onClick={() => setKind(k)} className={clsx("rounded-full px-4 py-1.5 text-sm", kind === k ? "bg-cyan-500 text-white" : "bg-white ring-1 ring-gray-200")}>
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>
      <KindEditor key={kind} kind={kind} data={data} baseUrl={baseUrl} />
    </div>
  );
}

function KindEditor({ kind, data, baseUrl }: { kind: Kind; data: InvitationsData; baseUrl: string }) {
  const save = useAction();
  const send = useAction();
  const [design, setDesign] = useState<Design>(data.designs[kind]);
  const [saved, setSaved] = useState<Design>(data.designs[kind]);
  const recipients = data.recipients[kind];
  const canGet = recipients.filter((r) => r.emails.length && r.sent < MAX_SENDS_PER_KIND);
  const [selected, setSelected] = useState<string[]>(() => canGet.filter((r) => r.sent === 0).map((r) => r.householdId));
  const dirty = JSON.stringify(design) !== JSON.stringify(saved);
  const set = (patch: Partial<Design>) => setDesign((d) => ({ ...d, ...patch }));

  const preview = useMemo(
    () =>
      invitationEmail({
        kind,
        design,
        theme: data.site?.theme ?? "classic",
        names: data.names,
        date: data.date,
        place: data.place,
        photoUrl: data.photoUrl,
        link: cardLinkPreview(data, kind, baseUrl),
        householdLabel: recipients[0]?.label,
      }).html,
    [kind, design, data, baseUrl, recipients]
  );
  const noEmail = recipients.filter((r) => !r.emails.length).length;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${panelClasses} space-y-3 p-5`}>
          <h2 className="text-base font-semibold">Design</h2>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TEMPLATES) as Template[]).map((t) => (
              <button key={t} type="button" aria-pressed={design.template === t} onClick={() => set({ template: t })} className={clsx("rounded-lg border px-3 py-1.5 text-sm", design.template === t ? "border-cyan-500 ring-2 ring-cyan-200" : "border-gray-200")}>
                {TEMPLATES[t].name}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">Colors come from your website theme. Names, date and place come from My Wedding and your website title.</p>
          <label className="block text-sm">Heading<input className={`${fieldClasses} mt-1`} maxLength={80} value={design.heading} onChange={(e) => set({ heading: e.target.value })} /></label>
          <label className="block text-sm">Message<textarea rows={4} className={`${fieldClasses} mt-1`} maxLength={800} value={design.message} onChange={(e) => set({ message: e.target.value })} /></label>
          <label className="block text-sm">
            Details (time, dress code, …)
            <textarea rows={2} className={`${fieldClasses} mt-1`} maxLength={300} value={design.details} onChange={(e) => set({ details: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={design.show_photo} disabled={!data.photoUrl} onChange={(e) => set({ show_photo: e.target.checked })} />
            Show my cover photo {!data.photoUrl && <span className="text-xs text-gray-500">(add one on Website)</span>}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" color="cyan" disabled={save.pending || !dirty} onClick={() => save.run(() => saveDesignAction({ kind, ...design }), () => setSaved(design), "Saved.")}>
              {save.pending ? "Saving…" : "Save design"}
            </Button>
            <Link href={`/client/print/invitations?kind=${kind}`} target="_blank" className="text-sm text-cyan-700 underline">Print one card</Link>
            {data.households.length > 0 && (
              <Link href={`/client/print/invitations?kind=${kind}&each=1`} target="_blank" className="text-sm text-cyan-700 underline">Print one per household</Link>
            )}
          </div>
          {(save.error || save.notice) && <p className={clsx("text-sm", save.error ? "text-red-600" : "text-emerald-700")}>{save.error || save.notice}</p>}
        </section>
        <section className={`${panelClasses} overflow-hidden`}>
          <p className="border-b border-gray-100 px-4 py-2 text-xs text-gray-500">Email preview</p>
          <iframe title="Email preview" srcDoc={preview} sandbox="" className="h-[640px] w-full" />
        </section>
      </div>

      <section className={`${panelClasses} space-y-3 p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Send by email</h2>
          <div className="flex gap-3 text-sm">
            <button type="button" className="text-cyan-700 underline" onClick={() => setSelected(canGet.filter((r) => r.sent === 0).map((r) => r.householdId))}>Not sent yet</button>
            <button type="button" className="text-cyan-700 underline" onClick={() => setSelected(canGet.map((r) => r.householdId))}>All</button>
            <button type="button" className="text-cyan-700 underline" onClick={() => setSelected([])}>None</button>
          </div>
        </div>
        {recipients.length === 0 ? (
          <p className="text-sm text-gray-500">Add guests (with emails) on your <Link href="/client/dashboard/guests" className="underline">Guest List</Link>.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto text-sm">
            {recipients.map((r) => {
              const can = r.emails.length > 0 && r.sent < MAX_SENDS_PER_KIND;
              return (
                <li key={r.householdId} className="flex items-center justify-between gap-2 py-2">
                  <label className={clsx("flex items-center gap-2", !can && "text-gray-400")}>
                    <input type="checkbox" disabled={!can} checked={selected.includes(r.householdId)} onChange={() => setSelected((s) => (s.includes(r.householdId) ? s.filter((x) => x !== r.householdId) : [...s, r.householdId]))} />
                    {r.label}
                    <span className="text-xs text-gray-500">{r.emails.length ? r.emails.join(", ") : "no email"}</span>
                  </label>
                  <span className="text-xs text-gray-500">{r.sent ? `sent ${r.sent}×${r.lastSent ? `, ${new Date(r.lastSent).toLocaleDateString("en-US")}` : ""}` : ""}</span>
                </li>
              );
            })}
          </ul>
        )}
        {noEmail > 0 && <p className="text-xs text-gray-500">{noEmail} household{noEmail === 1 ? " has" : "s have"} no email. Print a card for them instead.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            color="cyan"
            disabled={send.pending || dirty || !selected.length || !data.site?.published}
            title={dirty ? "Save your design first" : undefined}
            onClick={() =>
              confirm(`Email the ${KIND_LABELS[kind].toLowerCase()} to ${selected.length} household${selected.length === 1 ? "" : "s"}? Each household can get it at most ${MAX_SENDS_PER_KIND} times.`) &&
              send.run(async () => {
                const r = await sendInvitationsAction({ kind, householdIds: selected });
                if (r.ok) setSelected([]);
                return r.ok && r.failed ? { ok: false, error: `Sent ${r.sent}; ${r.failed} failed. Check those email addresses.` } : r;
              }, undefined, "Sent!")
            }
          >
            {send.pending ? "Sending…" : `Send to ${selected.length}`}
          </Button>
          {(send.error || send.notice) && <p className={clsx("text-sm", send.error ? "text-red-600" : "text-emerald-700")}>{send.error || send.notice}</p>}
        </div>
      </section>
    </>
  );
}
