// src/components/photos/PhotoUploader.tsx — pick photos, shrink them in the browser, upload each
// with a one-time link, then record it. Works on phones.
"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadWithTicket } from "@/lib/storage/client";
import { encodeImage } from "@/lib/image-encode";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES } from "@/lib/portfolio";
import { MAX_PER_BATCH, PHOTO_EDGE } from "@/lib/photo-share";
import { recordPhotoAction, startPhotoUploadsAction } from "@/app/w/[slug]/photos/actions";

export default function PhotoUploader({ slug }: { slug: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [honey, setHoney] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function upload(all: File[]) {
    setBusy(true);
    const files = all.filter((f) => ACCEPTED_TYPES.includes(f.type) && f.size <= MAX_UPLOAD_BYTES).slice(0, MAX_PER_BATCH);
    const skipped = all.length - files.length;
    if (!files.length) {
      setStatus("Those files can't be shared. Use photos (JPG, PNG, HEIC) under 10 MB.");
      return setBusy(false);
    }
    let failed = 0;
    // Shrink first: each upload ticket is signed for the exact type and size of its file.
    setStatus("Preparing photos…");
    const images: Awaited<ReturnType<typeof encodeImage>>[] = [];
    for (const f of files) {
      try {
        images.push(await encodeImage(f, PHOTO_EDGE));
      } catch {
        failed++;
      }
    }
    if (!images.length) {
      setStatus("Those photos couldn't be read. Try saving them as JPG first.");
      return setBusy(false);
    }
    const start = await startPhotoUploadsAction(slug, images.map((img) => ({ contentType: img.blob.type, bytes: img.blob.size })));
    if (!start.ok) {
      setStatus(start.error);
      return setBusy(false);
    }
    let done = 0;
    let pending = false;
    for (const [i, img] of images.entries()) {
      setStatus(`Sending ${i + 1} of ${images.length}…`);
      try {
        const u = start.uploads[i];
        const upErr = await uploadWithTicket(u.ticket, img.blob);
        if (upErr) throw new Error(upErr);
        const r = await recordPhotoAction(slug, { path: u.path, width: img.width, height: img.height, name, website: honey });
        if (!r.ok) throw new Error(r.error);
        pending ||= r.pending;
        done++;
      } catch {
        failed++;
      }
    }
    setStatus(
      [
        done ? `Thank you! ${done} photo${done === 1 ? "" : "s"} shared${pending ? ". They'll appear once the couple approves them" : ""}.` : "",
        failed ? `${failed} didn't upload. Please try those again.` : "",
        skipped ? `${skipped} file${skipped === 1 ? " was" : "s were"} skipped (not a photo, too big, or over ${MAX_PER_BATCH} at once).` : "",
      ]
        .filter(Boolean)
        .join(" ")
    );
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="mx-auto mt-8 max-w-sm space-y-3 text-center">
      <input aria-label="Your name (optional)" placeholder="Your name (optional)" maxLength={60} className="w-full rounded-lg border border-black/10 bg-white/90 px-3 py-2 text-gray-900" value={name} onChange={(e) => setName(e.target.value)} />
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={honey} onChange={(e) => setHoney(e.target.value)} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="w-full rounded-full px-6 py-3 font-semibold text-white disabled:opacity-50" style={{ background: "var(--ws-accent)" }}>
        {busy ? "Sending…" : "Choose photos"}
      </button>
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
      {status && <p role="status" className="text-sm">{status}</p>}
      <p className="text-xs opacity-60">Up to {MAX_PER_BATCH} at a time. Photos are only shared with the couple and their guests.</p>
    </div>
  );
}
