// src/components/vendor/PortfolioGallery.tsx — a vendor's portfolio for couples: cover photo,
// grid, a full-screen viewer (tap, swipe, arrow keys), and videos that load only when played.
// Rendered on the server too, so search engines see every photo and its alt text.
"use client";
import { useEffect, useRef, useState } from "react";
import { embedUrl, videoThumbUrl, type Video } from "@/lib/portfolio";

export type GalleryPhoto = { full: string; thumb: string; alt: string; caption: string | null; width: number | null; height: number | null };
export type GalleryVideo = Video & { id: string; title: string | null };

export function PortfolioGallery({ photos, videos, name }: { photos: GalleryPhoto[]; videos: GalleryVideo[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length && !videos.length) return null;
  const [cover, ...rest] = photos;

  return (
    <section aria-labelledby="portfolio" className="space-y-4">
      <h2 id="portfolio" className="text-xl font-semibold tracking-tight">
        Portfolio
      </h2>

      {cover && (
        <button type="button" onClick={() => setOpen(0)} className="block w-full overflow-hidden rounded-2xl bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element -- public CDN image with known size */}
          <img
            src={cover.full}
            alt={cover.alt}
            width={cover.width ?? undefined}
            height={cover.height ?? undefined}
            fetchPriority="high"
            className="aspect-[3/2] w-full object-cover"
          />
        </button>
      )}

      {rest.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rest.map((p, i) => (
            <li key={p.thumb}>
              <button type="button" onClick={() => setOpen(i + 1)} className="block w-full overflow-hidden rounded-lg bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element -- public CDN thumbnail */}
                <img src={p.thumb} alt={p.alt} loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {videos.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {videos.map((v) => (
            <li key={v.id}>
              <VideoPlayer video={v} name={name} />
              {v.title && <p className="mt-1 text-sm text-gray-700">{v.title}</p>}
            </li>
          ))}
        </ul>
      )}

      {open !== null && <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </section>
  );
}

function VideoPlayer({ video, name }: { video: GalleryVideo; name: string }) {
  const [playing, setPlaying] = useState(false);
  const still = videoThumbUrl(video);
  const label = video.title || `${name} video`;
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-gray-900">
      {playing ? (
        <iframe
          src={embedUrl(video)}
          title={label}
          className="absolute inset-0 size-full"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label={`Play ${label}`} className="group absolute inset-0">
          {still && (
            // eslint-disable-next-line @next/next/no-img-element -- third-party video still
            <img src={still} alt="" loading="lazy" className="size-full object-cover opacity-90" />
          )}
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-white/90 text-xl text-gray-900 shadow group-hover:bg-white">▶</span>
          </span>
        </button>
      )}
    </div>
  );
}

function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: GalleryPhoto[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);
  const go = (d: number) => onIndex((index + d + photos.length) % photos.length);
  const p = photos[index];

  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % photos.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + photos.length) % photos.length);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [index, photos.length, onClose, onIndex]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      <div className="flex items-center justify-between p-3 text-sm">
        <span>
          {index + 1} / {photos.length}
        </span>
        <button ref={close} type="button" onClick={onClose} className="rounded-md px-3 py-1.5 hover:bg-white/10">
          Close ✕
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- public CDN image */}
        <img src={p.full} alt={p.alt} className="max-h-full max-w-full object-contain" />
        {photos.length > 1 && (
          <>
            <button type="button" aria-label="Previous photo" onClick={() => go(-1)} className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-2xl hover:bg-white/20">
              ‹
            </button>
            <button type="button" aria-label="Next photo" onClick={() => go(1)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-2xl hover:bg-white/20">
              ›
            </button>
          </>
        )}
      </div>
      <p className="min-h-12 p-3 text-center text-sm text-gray-200">{p.caption}</p>
    </div>
  );
}
