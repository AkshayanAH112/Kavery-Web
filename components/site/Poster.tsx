"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Download, Expand, Loader2, Minus, Plus, Scan, X } from "lucide-react";

type ViewerLabels = { open: string; tapToZoom: string; close: string; zoomIn: string; zoomOut: string; fit: string; hint: string; viewerHint: string; save: string; saving: string };

const MAX_SCALE = 5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A poster on its notice page: shown whole at the page's width (never cropped),
 * and tapping it opens a full-screen viewer that zooms (pinch, double-tap,
 * mouse wheel, the + and − buttons) and pans, so small print can be read on a
 * phone. Without script the poster is a plain link to the image file.
 */
export function Poster({ src, alt, fileName, labels }: { src: string; alt: string; fileName: string; labels: ViewerLabels }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLAnchorElement>(null);

  return (
    <figure>
      <a
        ref={opener}
        href={src}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        aria-label={labels.open}
        className="group relative block overflow-hidden rounded-[var(--card-radius)] border border-line bg-surface shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- already sized before upload */}
        <img src={src} alt={alt} className="block h-auto w-full" />
        <span className="pointer-events-none absolute bottom-3 right-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-black/75 px-4 text-sm font-semibold text-white backdrop-blur-sm transition-transform duration-200 group-hover:scale-105">
          <Expand size={16} aria-hidden />
          {labels.tapToZoom}
        </span>
      </a>
      <figcaption className="mt-3 text-sm text-muted-foreground">{labels.hint}</figcaption>
      {open && (
        <PosterViewer
          src={src}
          alt={alt}
          fileName={fileName}
          labels={labels}
          onClose={() => {
            setOpen(false);
            opener.current?.focus();
          }}
        />
      )}
    </figure>
  );
}

function PosterViewer({ src, alt, fileName, labels, onClose }: { src: string; alt: string; fileName: string; labels: ViewerLabels; onClose: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [view, setViewState] = useState({ s: 1, x: 0, y: 0 });
  // Gestures read the latest view between renders, so it is kept in a ref as well as in state.
  const viewRef = useRef(view);
  const setView = useCallback((next: { s: number; x: number; y: number } | ((v: { s: number; x: number; y: number }) => { s: number; x: number; y: number })) => {
    const value = typeof next === "function" ? next(viewRef.current) : next;
    viewRef.current = value;
    setViewState(value);
  }, []);
  const [touching, setTouching] = useState(false);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ s: number; x: number; y: number; dist: number; mid: { x: number; y: number } } | null>(null);
  const lastTap = useRef(0);
  const moved = useRef(false);

  /** Keeps the poster from being dragged off the screen: it may move only as far as it overflows. */
  const bounded = useCallback((s: number, x: number, y: number) => {
    const box = stage.current?.getBoundingClientRect();
    const el = img.current;
    if (!box || !el) return { s, x, y };
    const limitX = Math.max(0, (el.offsetWidth * s - box.width) / 2);
    const limitY = Math.max(0, (el.offsetHeight * s - box.height) / 2);
    return { s, x: clamp(x, -limitX, limitX), y: clamp(y, -limitY, limitY) };
  }, []);

  /** A point on screen, measured from the middle of the stage (where the poster's scale is centred). */
  const fromCentre = useCallback((clientX: number, clientY: number) => {
    const box = stage.current!.getBoundingClientRect();
    return { x: clientX - (box.left + box.width / 2), y: clientY - (box.top + box.height / 2) };
  }, []);

  /** Zooms to `next`, keeping the point under `focus` where it is. */
  const zoomAt = useCallback(
    (next: number, focus = { x: 0, y: 0 }) => {
      const { s, x, y } = viewRef.current;
      const target = clamp(next, 1, MAX_SCALE);
      const ratio = target / s;
      setView(target === 1 ? { s: 1, x: 0, y: 0 } : bounded(target, focus.x - ratio * (focus.x - x), focus.y - ratio * (focus.y - y)));
    },
    [bounded, setView],
  );

  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") zoomAt(viewRef.current.s * 1.5);
      if (e.key === "-") zoomAt(viewRef.current.s / 1.5);
    };
    const onResize = () => setView((v) => bounded(v.s, v.x, v.y));
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      if (previous instanceof HTMLElement && previous !== document.body) previous.focus();
    };
  }, [onClose, zoomAt, bounded, setView]);

  const begin = () => {
    const points = [...pointers.current.values()];
    const { s, x, y } = viewRef.current;
    if (points.length >= 2) {
      const [a, b] = points;
      gesture.current = { s, x, y, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2) };
    } else if (points.length === 1) {
      gesture.current = { s, x, y, dist: 0, mid: fromCentre(points[0].x, points[0].y) };
    } else gesture.current = null;
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // A pointer the browser no longer counts as active cannot be captured; the gesture still works.
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = pointers.current.size > 1;
    setTouching(true);
    begin();
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const points = [...pointers.current.values()];
    if (points.length >= 2) {
      const [a, b] = points;
      const target = clamp((g.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist, 1, MAX_SCALE);
      const mid = fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
      const ratio = target / g.s;
      // The point that was under the fingers stays under them as they spread and move.
      setView(bounded(target, mid.x - ratio * (g.mid.x - g.x), mid.y - ratio * (g.mid.y - g.y)));
      moved.current = true;
    } else {
      const at = fromCentre(points[0].x, points[0].y);
      const dx = at.x - g.mid.x;
      const dy = at.y - g.mid.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved.current = true;
      if (g.s > 1) setView(bounded(g.s, g.x + dx, g.y + dy));
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size === 0) setTouching(false);
    begin();
    if (pointers.current.size > 0 || moved.current) return;
    // A double tap (or double click) zooms in on that spot, or back out.
    const now = Date.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      const { s } = viewRef.current;
      zoomAt(s > 1.05 ? 1 : 2.5, fromCentre(e.clientX, e.clientY));
    } else lastTap.current = now;
  };

  const onWheel = (e: ReactWheelEvent) => {
    zoomAt(viewRef.current.s * Math.exp(-e.deltaY * 0.0015), fromCentre(e.clientX, e.clientY));
  };

  const control = "inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button ref={closeButton} type="button" onClick={onClose} className={control} aria-label={labels.close}>
          <X size={22} aria-hidden />
        </button>
        <div className="flex items-center gap-2">
          <button type="button" className={control} onClick={() => zoomAt(view.s / 1.5)} disabled={view.s <= 1} aria-label={labels.zoomOut}>
            <Minus size={20} aria-hidden />
          </button>
          <span className="w-12 text-center text-sm font-semibold tabular-nums" aria-live="polite">
            {Math.round(view.s * 100)}%
          </span>
          <button type="button" className={control} onClick={() => zoomAt(view.s * 1.5)} disabled={view.s >= MAX_SCALE} aria-label={labels.zoomIn}>
            <Plus size={20} aria-hidden />
          </button>
          <button type="button" className={control} onClick={() => zoomAt(1)} disabled={view.s === 1} aria-label={labels.fit}>
            <Scan size={20} aria-hidden />
          </button>
        </div>
        <SavePosterButton src={src} fileName={fileName} title={alt} labels={labels} iconOnly />
      </div>
      <div
        ref={stage}
        className="relative flex min-h-0 flex-1 cursor-grab touch-none select-none items-center justify-center overflow-hidden active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- already sized before upload */}
        <img
          ref={img}
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full object-contain will-change-transform"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transition: touching ? "none" : "transform 180ms var(--ease-out, ease-out)" }}
        />
      </div>
      <p className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 text-center text-sm text-white/70">{labels.viewerHint}</p>
    </div>
  );
}

/**
 * Saves the poster to the phone. On a phone that can share files this is the
 * share sheet (Save Image, or straight into WhatsApp), because a download link
 * does nothing in an installed iPhone app. Elsewhere it is a download.
 */
export function SavePosterButton({ src, fileName, title, labels, iconOnly }: { src: string; fileName: string; title: string; labels: { save: string; saving: string }; iconOnly?: boolean }) {
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error("fetch");
      const blob = await res.blob();
      const extension = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
      const file = new File([blob], `${fileName}.${extension}`, { type: blob.type });
      if (window.matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      // Dismissing the share sheet is not a failure. Anything else: open the file, which can be long-pressed and saved.
      if ((err as Error)?.name !== "AbortError") window.open(src, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  }

  if (iconOnly)
    return (
      <button type="button" onClick={save} disabled={busy} aria-label={busy ? labels.saving : labels.save} className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-bold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60">
        {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Download size={18} aria-hidden />}
        <span className="hidden sm:inline">{labels.save}</span>
      </button>
    );

  return (
    <button type="button" onClick={save} disabled={busy} className="btn btn-brand">
      <span>
        {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Download size={18} aria-hidden />}
        {busy ? labels.saving : labels.save}
      </span>
    </button>
  );
}
