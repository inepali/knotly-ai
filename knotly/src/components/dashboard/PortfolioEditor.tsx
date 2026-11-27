// src/components/dashboard/PortfolioEditor.tsx — the vendor's Portfolio page: upload up to 25
// photos (shrunk in the browser, then sent straight to storage), captions, cover, order, delete;
// and up to 3 YouTube/Vimeo links.
"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ACCEPTED_TYPES,
  FULL_EDGE,
  MAX_IMAGES,
  MAX_UPLOAD_BYTES,
  MAX_VIDEOS,
  THUMB_EDGE,
  fitBatch,
  fitWithin,
  parseVideoUrl,
  portfolioUrl,
  videoThumbUrl,
} from "@/lib/portfolio";
import type { PortfolioImage, PortfolioVideo, RequestPortfolioUploadInput } from "@/lib/actions/vendor-portfolio";
import { uploadWithTicket, type UploadTicket } from "@/lib/storage/client";
import { Button } from "@/components/ui/Button";
import { fieldClasses, labelClasses, panelClasses } from "@/components/ui/fields";

type Result = { ok: true } | { ok: false; error: string };
type Actions = {
  requestUpload: (i: RequestPortfolioUploadInput) => Promise<
    { ok: true; data: { storagePath: string; thumbPath: string; tickets: { full: UploadTicket; thumb: UploadTicket } } } | { ok: false; error: string }
  >;
  addImage: (i: { storagePath: string; thumbPath: string; caption?: string; width: number; height: number }) => Promise<Result>;
  updateImage: (i: { id: string; caption?: string; isCover?: boolean }) => Promise<Result>;
  deleteImage: (i: { id: string }) => Promise<Result>;
  reorder: (i: { kind: "image" | "video"; ids: string[] }) => Promise<Result>;
  addVideo: (i: { url: string; title?: string }) => Promise<Result>;
  deleteVideo: (i: { id: string }) => Promise<Result>;
};

/** Draw the photo at most `edge` px on its long side; WebP, or JPEG where the browser can't make WebP. */
async function encode(bitmap: ImageBitmap, edge: number, quality: number) {
  const size = fitWithin(bitmap.width, bitmap.height, edge);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg"); // older Safari returns PNG for WebP
  if (!blob) throw new Error("encode");
  return { blob, ...size };
}


const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

type Upload = { name: string; status: "waiting" | "uploading" | "done" | "error"; error?: string };

export default function PortfolioEditor({
  images: initialImages,
  videos: initialVideos,
  actions,
}: {
  vendorId: string;
  images: PortfolioImage[];
  videos: PortfolioVideo[];
  actions: Actions;
}) {
  const router = useRouter();
  // Local copies for instant reordering/deleting; reset whenever the server sends fresh data.
  const [images, setImages] = useState(initialImages);
  const [videos, setVideos] = useState(initialVideos);
  const [seen, setSeen] = useState({ initialImages, initialVideos });
  if (seen.initialImages !== initialImages || seen.initialVideos !== initialVideos) {
    setSeen({ initialImages, initialVideos });
    setImages(initialImages);
    setVideos(initialVideos);
  }
  // A chosen cover always shows first (on the public page too), so it stays pinned here.
  const hasCover = images.some((i) => i.is_cover);

  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function act(fn: () => Promise<Result>, okNotice = "") {
    setError("");
    setNotice("");
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else setNotice(okNotice);
      router.refresh();
    });
  }

  // ---- Photos -------------------------------------------------------------------------------

  async function uploadOne(file: File): Promise<string | null> {
    if (!ACCEPTED_TYPES.includes(file.type) && !/\.(heic|heif)$/i.test(file.name)) return "Use a JPG, PNG, WebP or HEIC photo.";
    if (file.size > MAX_UPLOAD_BYTES) return "That photo is over 10 MB.";

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return "This browser can't read that photo. Try saving it as a JPG first.";
    }
    try {
      const full = await encode(bitmap, FULL_EDGE, 0.82);
      const thumb = await encode(bitmap, THUMB_EDGE, 0.78);
      // The server checks there's room and hands out one-time upload tickets for both files.
      const t = await actions.requestUpload({
        full: { contentType: full.blob.type as "image/webp" | "image/jpeg", bytes: full.blob.size },
        thumb: { contentType: thumb.blob.type as "image/webp" | "image/jpeg", bytes: thumb.blob.size },
      });
      if (!t.ok) return t.error;
      const { storagePath, thumbPath, tickets } = t.data;
      const upErr = (await uploadWithTicket(tickets.full, full.blob)) ?? (await uploadWithTicket(tickets.thumb, thumb.blob));
      if (upErr) return upErr;
      // The server verifies and records it (and deletes both files if it can't).
      const r = await actions.addImage({ storagePath, thumbPath, width: full.width, height: full.height });
      return r.ok ? null : r.error;
    } catch {
      return "Something went wrong preparing that photo.";
    } finally {
      bitmap.close();
    }
  }

  function addFiles(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const { take, skipped } = fitBatch(images.length, files.length);
    setError(skipped ? `You can have up to ${MAX_IMAGES} photos, so ${skipped} ${skipped === 1 ? "wasn't" : "weren't"} added.` : "");
    setNotice("");
    const batch = files.slice(0, take);
    if (!batch.length) return;
    setUploads(batch.map((f) => ({ name: f.name, status: "waiting" })));

    start(async () => {
      for (let i = 0; i < batch.length; i++) {
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, status: "uploading" } : x)));
        const problem = await uploadOne(batch[i]);
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, status: problem ? "error" : "done", error: problem ?? undefined } : x)));
      }
      router.refresh();
    });
  }

  function reorderImages(from: number, to: number) {
    if (to < 0 || to >= images.length) return;
    if (hasCover && (from === 0 || to === 0)) return;
    const next = move(images, from, to);
    setImages(next);
    act(() => actions.reorder({ kind: "image", ids: next.map((i) => i.id) }));
  }

  // ---- Videos -------------------------------------------------------------------------------

  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const videoValid = !!parseVideoUrl(videoUrl);

  function addVideo(e: React.FormEvent) {
    e.preventDefault();
    act(async () => {
      const r = await actions.addVideo({ url: videoUrl, title: videoTitle || undefined });
      if (r.ok) {
        setVideoUrl("");
        setVideoTitle("");
      }
      return r;
    }, "Video added.");
  }

  function reorderVideos(from: number, to: number) {
    if (to < 0 || to >= videos.length) return;
    const next = move(videos, from, to);
    setVideos(next);
    act(() => actions.reorder({ kind: "video", ids: next.map((v) => v.id) }));
  }

  const busy = pending || uploads.some((u) => u.status === "uploading" || u.status === "waiting");

  return (
    <div className="mt-6 space-y-8">
      {(error || notice) && (
        <p role="status" className={error ? "text-sm text-red-600" : "text-sm text-green-700"}>
          {error || notice}
        </p>
      )}

      <section className={`${panelClasses} p-5`} aria-labelledby="photos">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="photos" className="text-base font-semibold">
            Photos <span className="font-normal text-gray-500">({images.length}/{MAX_IMAGES})</span>
          </h2>
          <p className="text-xs text-gray-500">The first photo is your cover unless you pick one.</p>
        </div>

        {images.length < MAX_IMAGES && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`mt-4 rounded-xl border-2 border-dashed p-6 text-center text-sm ${dragOver ? "border-cyan-400 bg-cyan-50" : "border-gray-300"}`}
          >
            <p className="text-gray-700">Drag photos here, or</p>
            <Button type="button" color="cyan" className="mt-2" disabled={busy} onClick={() => fileInput.current?.click()}>
              Choose photos
            </Button>
            <p className="mt-2 text-xs text-gray-500">JPG, PNG, WebP or HEIC, up to 10 MB each. We resize them for fast loading.</p>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={[...ACCEPTED_TYPES, ".heic", ".heif"].join(",")}
              className="sr-only"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {uploads.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {uploads.map((u, i) => (
              <li key={`${u.name}-${i}`} className={u.status === "error" ? "text-red-600" : "text-gray-600"}>
                {u.name}: {u.status === "waiting" ? "waiting" : u.status === "uploading" ? "uploading…" : u.status === "done" ? "added" : u.error}
              </li>
            ))}
          </ul>
        )}

        {images.length === 0 ? (
          <p className="mt-4 text-sm text-gray-600">Couples decide faster when they see your work. Add at least 6 photos.</p>
        ) : (
          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {images.map((img, i) => (
              <PhotoTile
                key={img.id}
                img={img}
                index={i}
                count={images.length}
                isCover={img.is_cover || (!hasCover && i === 0)}
                firstMovable={hasCover ? 1 : 0}
                disabled={pending}
                onMove={reorderImages}
                onCaption={(caption) => act(() => actions.updateImage({ id: img.id, caption }), "Caption saved.")}
                onCover={() => act(() => actions.updateImage({ id: img.id, isCover: true }), "Cover photo set.")}
                onDelete={() => {
                  if (!confirm("Delete this photo?")) return;
                  setImages((list) => list.filter((x) => x.id !== img.id));
                  act(() => actions.deleteImage({ id: img.id }), "Photo deleted.");
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <section className={`${panelClasses} p-5`} aria-labelledby="videos">
        <h2 id="videos" className="text-base font-semibold">
          Videos <span className="font-normal text-gray-500">({videos.length}/{MAX_VIDEOS})</span>
        </h2>

        {videos.length < MAX_VIDEOS && (
          <form onSubmit={addVideo} className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="video-url" className={labelClasses}>
                YouTube or Vimeo link
              </label>
              <input
                id="video-url"
                type="url"
                inputMode="url"
                placeholder="https://youtu.be/…"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className={fieldClasses}
              />
            </div>
            <div>
              <label htmlFor="video-title" className={labelClasses}>
                Title (optional)
              </label>
              <input
                id="video-title"
                maxLength={120}
                placeholder="Highlight film"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                className={fieldClasses}
              />
            </div>
            <Button type="submit" color="cyan" disabled={pending || !videoValid}>
              Add video
            </Button>
            {videoUrl && !videoValid && <p className="text-xs text-gray-500 sm:col-span-3">Only YouTube and Vimeo links are supported.</p>}
          </form>
        )}

        {videos.length > 0 && (
          <ul className="mt-5 space-y-3">
            {videos.map((v, i) => {
              const still = videoThumbUrl({ provider: v.provider, videoId: v.video_id });
              return (
                <li key={v.id} className="flex items-center gap-3">
                  <div className="flex h-14 w-24 flex-none items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-xs text-gray-500">
                    {still ? (
                      // eslint-disable-next-line @next/next/no-img-element -- third-party video still
                      <img src={still} alt="" className="size-full object-cover" />
                    ) : (
                      "Vimeo"
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.title || "Untitled video"}</p>
                    <a href={v.url} target="_blank" rel="noopener noreferrer" className="truncate text-xs text-gray-500 hover:underline">
                      {v.url}
                    </a>
                  </div>
                  <div className="flex gap-1">
                    <IconButton label="Move up" disabled={pending || i === 0} onClick={() => reorderVideos(i, i - 1)}>
                      ↑
                    </IconButton>
                    <IconButton label="Move down" disabled={pending || i === videos.length - 1} onClick={() => reorderVideos(i, i + 1)}>
                      ↓
                    </IconButton>
                    <IconButton
                      label="Delete video"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm("Remove this video?")) return;
                        setVideos((list) => list.filter((x) => x.id !== v.id));
                        act(() => actions.deleteVideo({ id: v.id }), "Video removed.");
                      }}
                    >
                      ✕
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function IconButton({ label, children, ...props }: { label: string; children: React.ReactNode } & React.ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center rounded-md border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      {...props}
    >
      {children}
    </button>
  );
}

function PhotoTile({
  img,
  index,
  count,
  isCover,
  firstMovable,
  disabled,
  onMove,
  onCaption,
  onCover,
  onDelete,
}: {
  img: PortfolioImage;
  index: number;
  count: number;
  isCover: boolean;
  firstMovable: number;
  disabled: boolean;
  onMove: (from: number, to: number) => void;
  onCaption: (caption: string) => void;
  onCover: () => void;
  onDelete: () => void;
}) {
  const [caption, setCaption] = useState(img.caption ?? "");
  const [savedCaption, setSavedCaption] = useState(img.caption);
  if (savedCaption !== img.caption) {
    setSavedCaption(img.caption);
    setCaption(img.caption ?? "");
  }
  const locked = index < firstMovable; // the chosen cover

  return (
    <li className="space-y-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- public CDN thumbnail, already sized */}
        <img src={portfolioUrl(img.thumb_path)} alt={img.caption ?? ""} loading="lazy" className="size-full object-cover" />
        {isCover && (
          <span className="absolute top-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-gray-900">Cover</span>
        )}
      </div>
      <input
        aria-label="Caption"
        maxLength={200}
        placeholder="Caption (optional)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => caption !== (img.caption ?? "") && onCaption(caption)}
        className={`${fieldClasses} text-xs`}
      />
      <div className="flex flex-wrap gap-1">
        <IconButton label="Move earlier" disabled={disabled || locked || index <= firstMovable} onClick={() => onMove(index, index - 1)}>
          ←
        </IconButton>
        <IconButton label="Move later" disabled={disabled || locked || index === count - 1} onClick={() => onMove(index, index + 1)}>
          →
        </IconButton>
        {!img.is_cover && (
          <button type="button" disabled={disabled} onClick={onCover} className="rounded-md px-2 text-xs text-cyan-700 hover:underline disabled:opacity-40">
            Make cover
          </button>
        )}
        <button type="button" disabled={disabled} onClick={onDelete} className="ml-auto rounded-md px-2 text-xs text-red-600 hover:underline disabled:opacity-40">
          Delete
        </button>
      </div>
    </li>
  );
}
