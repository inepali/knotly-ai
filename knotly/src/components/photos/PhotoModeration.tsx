// src/components/photos/PhotoModeration.tsx — the couple's photo album: approve/hide, delete,
// "approve first" setting, QR sign, and download as .zip (in parts, built in the browser).
"use client";
import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { panelClasses } from "@/components/ui/fields";
import { useAction } from "@/components/dashboard/useAction";
import { deletePhotosAction, moderatePhotosAction, setPhotoSettingsAction } from "@/app/client/dashboard/actions";
import { makeZip } from "@/lib/zip";
import { zipParts, type GuestPhoto } from "@/lib/photo-share";
import type { loadPhotoShare } from "@/lib/actions/photo-share";

type Data = Extract<Awaited<ReturnType<typeof loadPhotoShare>>, { ok: true }>["data"];
type Tab = GuestPhoto["status"];
const TABS: { key: Tab; label: string }[] = [
  { key: "pending", label: "Waiting" },
  { key: "approved", label: "Showing" },
  { key: "hidden", label: "Hidden" },
];

export default function PhotoModeration({ data, link, qr }: { data: Data; link: string | null; qr: string | null }) {
  const act = useAction();
  const setting = useAction();
  const [tab, setTab] = useState<Tab>(data.photos.some((p) => p.status === "pending") ? "pending" : "approved");
  const [sel, setSel] = useState<string[]>([]);
  const [zip, setZip] = useState("");
  const shown = data.photos.filter((p) => p.status === tab);
  const count = (s: Tab) => data.photos.filter((p) => p.status === s).length;
  const kept = data.photos.filter((p) => p.status !== "hidden");

  async function downloadAll() {
    const parts = zipParts(kept);
    for (const [i, part] of parts.entries()) {
      setZip(`Preparing part ${i + 1} of ${parts.length}…`);
      const entries = [];
      for (const [j, p] of part.entries()) {
        if (!p.url) continue;
        const res = await fetch(p.url);
        if (!res.ok) continue;
        const ext = p.path.endsWith(".jpg") ? "jpg" : "webp";
        const who = (p.uploader_name ?? "guest").replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 30) || "guest";
        entries.push({ name: `${String(i * 150 + j + 1).padStart(4, "0")}-${who}.${ext}`, data: new Uint8Array(await res.arrayBuffer()), date: new Date(p.created_at) });
      }
      const blob = new Blob([makeZip(entries) as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: parts.length > 1 ? `wedding-photos-part-${i + 1}.zip` : "wedding-photos.zip" }).click();
      URL.revokeObjectURL(url);
    }
    setZip(parts.length ? "Downloaded." : "");
  }

  return (
    <div className="mt-6 space-y-6">
      <section className={`${panelClasses} flex flex-wrap items-center gap-6 p-5`}>
        {qr && <span dangerouslySetInnerHTML={{ __html: qr }} />}
        <div className="space-y-2 text-sm">
          {link ? (
            <>
              <p>
                Guests go to{" "}
                <a href={link} target="_blank" rel="noopener noreferrer" className="text-cyan-700 underline">{link.replace(/^https?:\/\//, "")}</a>
              </p>
              {!data.site?.published_at && <p className="text-amber-700">Publish your website so guests can open it.</p>}
              <Link href="/client/print/photos" target="_blank" className="text-cyan-700 underline">Print a table sign</Link>
            </>
          ) : (
            <p>Create your <Link href="/client/dashboard/website" className="text-cyan-700 underline">wedding website</Link> first. Photo sharing lives there.</p>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={data.settings.approve_first} disabled={setting.pending} onChange={(e) => setting.run(() => setPhotoSettingsAction({ approve_first: e.target.checked }))} />
            Approve photos before guests can see them
          </label>
          {setting.error && <p className="text-red-600">{setting.error}</p>}
          <p className="text-xs text-gray-500">
            {data.photos.length}/1,000 photos.
            {data.expiresAt && ` Kept until ${new Date(data.expiresAt).toLocaleDateString("en-US")}. Download them before then.`}
          </p>
        </div>
      </section>

      <section className={`${panelClasses} space-y-3 p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" className="flex gap-2">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => {
                  setTab(t.key);
                  setSel([]);
                }} className={clsx("rounded-full px-3 py-1 text-sm", tab === t.key ? "bg-cyan-500 text-white" : "ring-1 ring-gray-200")}>
                {t.label} ({count(t.key)})
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" color="gray" disabled={!kept.length || !!zip.startsWith("Preparing")} onClick={downloadAll}>
            Download all ({kept.length})
          </Button>
        </div>
        {zip && <p className="text-sm text-gray-600">{zip}</p>}
        {shown.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button type="button" className="underline" onClick={() => setSel(sel.length === shown.length ? [] : shown.map((p) => p.id))}>
              {sel.length === shown.length ? "Select none" : "Select all"}
            </button>
            {sel.length > 0 && (
              <>
                <span className="text-gray-500">{sel.length} selected</span>
                {tab !== "approved" && <button type="button" className="font-semibold text-emerald-700 underline" onClick={() => act.run(() => moderatePhotosAction({ ids: sel, status: "approved" }), () => setSel([]))}>Show</button>}
                {tab !== "hidden" && <button type="button" className="text-gray-700 underline" onClick={() => act.run(() => moderatePhotosAction({ ids: sel, status: "hidden" }), () => setSel([]))}>Hide</button>}
                <button type="button" className="text-red-600 underline" onClick={() => confirm(`Delete ${sel.length} photo${sel.length === 1 ? "" : "s"} for good?`) && act.run(() => deletePhotosAction({ ids: sel }), () => setSel([]))}>Delete</button>
              </>
            )}
          </div>
        )}
        {act.error && <p role="alert" className="text-sm text-red-600">{act.error}</p>}
        {shown.length === 0 ? (
          <p className="text-sm text-gray-500">{tab === "pending" ? "Nothing waiting for approval." : "No photos here yet."}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {shown.map((p) => (
              <li key={p.id}>
                <button type="button" aria-pressed={sel.includes(p.id)} onClick={() => setSel((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))} className={clsx("block w-full overflow-hidden rounded-lg", sel.includes(p.id) && "ring-4 ring-cyan-400")}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link */}
                  {p.url ? <img src={p.url} alt="" loading="lazy" className="aspect-square w-full object-cover" /> : <span className="block aspect-square bg-gray-100" />}
                </button>
                <p className="mt-0.5 truncate text-xs text-gray-500">{p.uploader_name ?? "Guest"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
