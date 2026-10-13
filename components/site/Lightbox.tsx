"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type Photo = { id: string; url: string; caption?: string | null };
type Labels = { open: string; close: string; previous: string; next: string };

/**
 * A photo grid that opens each picture full-screen. Keyboard: arrows to move,
 * Escape to close. The grid itself is plain links to the images, so it works
 * (opening the file) even before the script has loaded.
 */
export function Lightbox({ photos, labels }: { photos: Photo[]; labels: Labels }) {
  const [index, setIndex] = useState<number | null>(null);
  const close = useCallback(() => setIndex(null), []);
  const step = useCallback((by: number) => setIndex((i) => (i === null ? i : (i + by + photos.length) % photos.length)), [photos.length]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [index, close, step]);

  const current = index === null ? null : photos[index];

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, i) => (
          <li key={photo.id}>
            <a
              href={photo.url}
              aria-label={`${labels.open} ${i + 1}${photo.caption ? `: ${photo.caption}` : ""}`}
              onClick={(e) => {
                e.preventDefault();
                setIndex(i);
              }}
              className="group block aspect-square overflow-hidden rounded-[var(--card-radius)] bg-surface"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- already resized before upload */}
              <img src={photo.url} alt={photo.caption || "Kavery Sports Club gallery photo"} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            </a>
          </li>
        ))}
      </ul>

      {current && (
        <div role="dialog" aria-modal="true" aria-label={current.caption ?? labels.open} className="fixed inset-0 z-[60] flex flex-col bg-black/95" onClick={close}>
          <div className="flex items-center justify-between gap-4 p-3 text-white">
            <p className="px-2 text-sm tabular-nums">
              {(index ?? 0) + 1} / {photos.length}
            </p>
            <button type="button" aria-label={labels.close} onClick={close} className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full hover:bg-white/10">
              <X aria-hidden />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url} alt={current.caption || "Kavery Sports Club gallery photo"} className="max-h-full max-w-full object-contain" />
            {photos.length > 1 && (
              <>
                <button type="button" aria-label={labels.previous} onClick={() => step(-1)} className="absolute left-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
                  <ChevronLeft aria-hidden />
                </button>
                <button type="button" aria-label={labels.next} onClick={() => step(1)} className="absolute right-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
                  <ChevronRight aria-hidden />
                </button>
              </>
            )}
          </div>
          <p className="min-h-12 p-4 text-center text-white">{current.caption}</p>
        </div>
      )}
    </>
  );
}
