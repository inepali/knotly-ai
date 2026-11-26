// src/components/website/SitePhotos.tsx — up to 10 photos; the first is the cover.
// Photos are shrunk in the browser and uploaded straight to storage, then recorded.
"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { panelClasses } from "@/components/ui/fields";
import { useAction } from "@/components/dashboard/useAction";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { encodeImage } from "@/lib/image-encode";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES } from "@/lib/portfolio";
import { MAX_SITE_PHOTOS, SITE_BUCKET, sitePhotoUrl, type SitePhoto } from "@/lib/wedding-site";
import { addSitePhotoAction, moveSitePhotoAction, removeSitePhotoAction } from "@/app/client/dashboard/actions";

const EDGE = 2400;

export default function SitePhotos({ projectId, photos }: { projectId: string; photos: SitePhoto[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const act = useAction();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const room = MAX_SITE_PHOTOS - photos.length;

  async function upload(files: File[]) {
    setBusy(true);
    const take = files.slice(0, room);
    let done = 0;
    const problems: string[] = [];
    for (const f of take) {
      setStatus(`Uploading ${done + 1} of ${take.length}…`);
      if (!ACCEPTED_TYPES.includes(f.type) || f.size > MAX_UPLOAD_BYTES) {
        problems.push(`${f.name}: use a JPG, PNG, WebP or HEIC under 10 MB.`);
        continue;
      }
      try {
        const img = await encodeImage(f, EDGE);
        const path = `${projectId}/${crypto.randomUUID()}.${img.ext}`;
        const { error } = await supabaseBrowser().storage.from(SITE_BUCKET).upload(path, img.blob, { contentType: img.blob.type, cacheControl: "31536000" });
        if (error) throw new Error(error.message);
        const r = await addSitePhotoAction({ path, width: img.width, height: img.height });
        if (!r.ok) throw new Error(r.error);
        done++;
      } catch (e) {
        problems.push(`${f.name}: ${e instanceof Error ? e.message : "couldn't upload"}`);
      }
    }
    if (files.length > take.length) problems.push(`Only ${MAX_SITE_PHOTOS} photos fit; ${files.length - take.length} skipped.`);
    setStatus([done ? `Added ${done} photo${done === 1 ? "" : "s"}.` : "", ...problems].filter(Boolean).join(" "));
    setBusy(false);
    router.refresh();
  }

  return (
    <section className={`${panelClasses} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Photos ({photos.length}/{MAX_SITE_PHOTOS})</h2>
        {room > 0 && (
          <>
            <Button type="button" variant="outline" color="gray" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? "Uploading…" : "Add photos"}
            </Button>
            <input
              ref={input}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                if (files.length) upload(files);
              }}
            />
          </>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-600">The first photo is your cover. The rest show in &quot;Photos of us&quot;.</p>
      {status && <p className="mt-2 text-sm text-gray-700">{status}</p>}
      {photos.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((p, i) => (
            <li key={p.path} className="space-y-1 text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element -- public CDN image */}
              <img src={sitePhotoUrl(p.path)} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
              <div className="flex flex-wrap items-center gap-2">
                {i === 0 ? (
                  <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-cyan-800">Cover</span>
                ) : (
                  <button type="button" className="text-cyan-700 underline" disabled={act.pending} onClick={() => act.run(() => moveSitePhotoAction({ path: p.path, to: 0 }))}>
                    Make cover
                  </button>
                )}
                <button type="button" aria-label="Move left" className="disabled:opacity-30" disabled={i === 0 || act.pending} onClick={() => act.run(() => moveSitePhotoAction({ path: p.path, to: i - 1 }))}>←</button>
                <button type="button" aria-label="Move right" className="disabled:opacity-30" disabled={i === photos.length - 1 || act.pending} onClick={() => act.run(() => moveSitePhotoAction({ path: p.path, to: i + 1 }))}>→</button>
                <button type="button" className="text-red-600 underline" disabled={act.pending} onClick={() => confirm("Remove this photo?") && act.run(() => removeSitePhotoAction({ path: p.path }))}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {act.error && <p role="alert" className="mt-2 text-sm text-red-600">{act.error}</p>}
    </section>
  );
}
