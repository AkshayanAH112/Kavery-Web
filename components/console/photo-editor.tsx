"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, ImagePlus, Loader2, RotateCw, SwitchCamera, X, ZoomIn, ZoomOut } from "lucide-react";

/** The student card's photo frame is 210 × 276. */
export const CARD_PHOTO_ASPECT = 210 / 276;
// Three times the frame, so the printed card stays sharp.
const OUT_WIDTH = 630;
const MAX_ZOOM = 5;

type View = { zoom: number; x: number; y: number; turns: number };
const START: View = { zoom: 1, x: 0, y: 0, turns: 0 };

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This picture could not be opened. Try a JPEG or PNG."));
    img.src = src;
  });
}

/**
 * How big the picture is against the frame, as a multiple of the frame's width and
 * height. At zoom 1 it just covers the frame, so there is never an empty edge.
 */
function coverage(img: HTMLImageElement, aspect: number, view: View) {
  const sideways = view.turns % 2 === 1;
  const ratio = sideways ? img.naturalHeight / img.naturalWidth : img.naturalWidth / img.naturalHeight;
  return ratio > aspect ? { w: (view.zoom * ratio) / aspect, h: view.zoom } : { w: view.zoom, h: (view.zoom * aspect) / ratio };
}

/** Keeps the picture covering the frame: x and y are offsets in frame widths and heights. */
function clamp(img: HTMLImageElement, aspect: number, view: View): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom));
  const { w, h } = coverage(img, aspect, { ...view, zoom });
  const mx = (w - 1) / 2;
  const my = (h - 1) / 2;
  return { ...view, zoom, x: Math.min(mx, Math.max(-mx, view.x)), y: Math.min(my, Math.max(-my, view.y)) };
}

/** Draws the framed part of the picture onto a canvas of any size; the preview and the saved file use the same code. */
function paint(ctx: CanvasRenderingContext2D, img: HTMLImageElement, aspect: number, view: View, width: number, height: number) {
  const { w, h } = coverage(img, aspect, view);
  const dw = w * width;
  const dh = h * height;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2 + view.x * width, height / 2 + view.y * height);
  ctx.rotate((view.turns * Math.PI) / 2);
  // Turned sideways, the picture's own width runs down the screen.
  if (view.turns % 2 === 1) ctx.drawImage(img, -dh / 2, -dw / 2, dh, dw);
  else ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

async function toFile(canvas: HTMLCanvasElement): Promise<File> {
  for (const type of ["image/webp", "image/jpeg"]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
    if (blob && blob.type === type) return new File([blob], type === "image/webp" ? "photo.webp" : "photo.jpg", { type });
  }
  throw new Error("This browser could not save the photo.");
}

/** Crop, move, zoom and turn a picture inside a fixed frame. */
export function PhotoCropper({ file, aspect = CARD_PHOTO_ASPECT, title = "Adjust photo", onCancel, onDone }: { file: File; aspect?: number; title?: string; onCancel: () => void; onDone: (file: File) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(START);
  const [saving, setSaving] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    const url = URL.createObjectURL(file);
    let active = true;
    loadImage(url)
      .then((loaded) => active && setImg(loaded))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const update = useCallback((change: (v: View) => View) => setView((v) => (img ? clamp(img, aspect, change(v)) : v)), [img, aspect]);

  // Redraw the preview at the screen's pixel density.
  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame || !img) return;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(frame.clientWidth * dpr);
      canvas.height = Math.round(frame.clientHeight * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) paint(ctx, img, aspect, view, canvas.width, canvas.height);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [img, aspect, view]);

  // A wheel listener must be non-passive to stop the page scrolling under the frame.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      update((v) => ({ ...v, zoom: v.zoom * Math.exp(-e.deltaY * 0.0015) }));
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [update]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const known = pointers.current;
    const before = known.get(e.pointerId);
    const frame = frameRef.current;
    if (!before || !frame) return;
    const others = [...known.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
    const now = { x: e.clientX, y: e.clientY };
    known.set(e.pointerId, now);
    if (others.length === 0) {
      // One finger or the mouse moves the picture.
      update((v) => ({ ...v, x: v.x + (now.x - before.x) / frame.clientWidth, y: v.y + (now.y - before.y) / frame.clientHeight }));
    } else {
      // Two fingers pinch to zoom.
      const other = others[0];
      const was = Math.hypot(before.x - other.x, before.y - other.y);
      const is = Math.hypot(now.x - other.x, now.y - other.y);
      if (was > 0) update((v) => ({ ...v, zoom: v.zoom * (is / was) }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  const save = async () => {
    if (!img) return;
    setSaving(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT_WIDTH;
      canvas.height = Math.round(OUT_WIDTH / aspect);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser could not save the photo.");
      paint(ctx, img, aspect, view, canvas.width, canvas.height);
      onDone(await toFile(canvas));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The photo could not be saved.");
      setSaving(false);
    }
  };

  const iconButton = "inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-border text-foreground hover:bg-muted disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-y-auto rounded-(--card-radius) border border-border bg-card p-5 shadow-2xl">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button type="button" onClick={onCancel} aria-label="Cancel" className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full hover:bg-muted">
            <X size={18} aria-hidden />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">Drag to move. Pinch, scroll or use the slider to zoom.</p>

        <div
          ref={frameRef}
          className="relative mx-auto w-full max-w-64 touch-none overflow-hidden rounded-xl border-2 border-primary bg-muted select-none"
          style={{ aspectRatio: String(aspect), cursor: img ? "grab" : "default" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-label="Photo preview" />
          {/* Thirds, to help centre the face. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, i) => <span key={i} className="border-[0.5px] border-white/35" />)}
          </div>
          {!img && !error && (
            <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Loader2 className="animate-spin" size={24} aria-hidden />
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button type="button" className={iconButton} disabled={!img} onClick={() => update((v) => ({ ...v, zoom: v.zoom / 1.2 }))} aria-label="Zoom out">
            <ZoomOut size={18} aria-hidden />
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={view.zoom}
            disabled={!img}
            onChange={(e) => update((v) => ({ ...v, zoom: Number(e.target.value) }))}
            aria-label="Zoom"
            className="min-w-0 flex-1 accent-primary"
          />
          <button type="button" className={iconButton} disabled={!img} onClick={() => update((v) => ({ ...v, zoom: v.zoom * 1.2 }))} aria-label="Zoom in">
            <ZoomIn size={18} aria-hidden />
          </button>
          <button type="button" className={iconButton} disabled={!img} onClick={() => update((v) => ({ ...v, x: 0, y: 0, turns: (v.turns + 1) % 4 }))} aria-label="Turn a quarter" title="Turn">
            <RotateCw size={18} aria-hidden />
          </button>
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={() => setView(START)} disabled={!img} className="min-h-11 flex-1 cursor-pointer rounded-lg border border-border font-semibold hover:bg-muted disabled:opacity-50">
            Reset
          </button>
          <button type="button" onClick={save} disabled={!img || saving} className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {saving ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <Check size={16} aria-hidden />} Use photo
          </button>
        </div>
      </div>
    </div>
  );
}

/** A live camera inside the page, for laptops and desktops at a registration desk. */
export function CameraCapture({ onCancel, onCapture, onUnavailable }: { onCancel: () => void; onCapture: (file: File) => void; onUnavailable: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [ready, setReady] = useState(false);
  const [cameras, setCameras] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (s) => {
        if (!active) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        await video.play().catch(() => {});
        setReady(true);
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (active) setCameras(devices.filter((d) => d.kind === "videoinput").length);
      })
      // Blocked, or no camera: fall back to the phone's own camera app or a file.
      .catch(() => active && onUnavailable());
    return () => {
      active = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, onUnavailable]);

  const shoot = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // The front camera is shown mirrored; save it the way others see the face.
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    onCapture(await toFile(canvas));
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black p-4" role="dialog" aria-modal="true" aria-label="Take a photo">
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} playsInline muted className={`h-auto max-h-[70dvh] w-full object-contain ${facing === "user" ? "-scale-x-100" : ""}`} />
        {!ready && (
          <span className="absolute inset-0 flex min-h-48 items-center justify-center text-white/80">
            <Loader2 className="animate-spin" size={28} aria-hidden />
          </span>
        )}
      </div>
      <div className="flex items-center gap-6">
        <button type="button" onClick={onCancel} aria-label="Cancel" className="inline-flex size-12 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
          <X size={22} aria-hidden />
        </button>
        <button type="button" onClick={shoot} disabled={!ready} aria-label="Take photo" className="inline-flex size-18 cursor-pointer items-center justify-center rounded-full border-4 border-white bg-white/20 text-white hover:bg-white/30 disabled:opacity-50">
          <Camera size={28} aria-hidden />
        </button>
        <button type="button" onClick={() => { setReady(false); setFacing((f) => (f === "user" ? "environment" : "user")); }} disabled={cameras < 2} aria-label="Switch camera" className="inline-flex size-12 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 disabled:invisible">
          <SwitchCamera size={22} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * "Upload" and "Camera" for a photo that must fit a frame. Whatever is picked or
 * taken goes through the cropper; `onPhoto` receives the cropped file.
 * On phones the camera button opens the phone's own camera app, which focuses and
 * exposes better than a page can; elsewhere the camera runs inside the page.
 */
export function PhotoSource({ onPhoto, busy = false, aspect = CARD_PHOTO_ASPECT, uploadLabel = "Upload", className = "" }: { onPhoto: (file: File) => void; busy?: boolean; aspect?: number; uploadLabel?: string; className?: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<File | null>(null);
  const [liveCamera, setLiveCamera] = useState(false);
  const [cameraError, setCameraError] = useState(false);

  const openCamera = () => {
    setCameraError(false);
    const phone = window.matchMedia("(pointer: coarse)").matches;
    if (!phone && typeof navigator.mediaDevices?.getUserMedia === "function") setLiveCamera(true);
    else cameraInput.current?.click();
  };
  // A file picker can only be opened by a tap, so a refused camera is reported, not worked around.
  const cameraUnavailable = useCallback(() => {
    setLiveCamera(false);
    setCameraError(true);
  }, []);
  const picked = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (file) setEditing(file);
  };

  const button = "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50";

  return (
    <>
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className={button}>
          <ImagePlus size={16} aria-hidden /> {uploadLabel}
        </button>
        <button type="button" onClick={openCamera} disabled={busy} className={button}>
          <Camera size={16} aria-hidden /> Camera
        </button>
      </div>
      {cameraError && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          The camera could not be opened. Allow camera access for this site, or use {uploadLabel}.
        </p>
      )}
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => picked(e.currentTarget)} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => picked(e.currentTarget)} />
      {liveCamera && (
        <CameraCapture
          onCancel={() => setLiveCamera(false)}
          onUnavailable={cameraUnavailable}
          onCapture={(file) => {
            setLiveCamera(false);
            setEditing(file);
          }}
        />
      )}
      {editing && (
        <PhotoCropper
          file={editing}
          aspect={aspect}
          onCancel={() => setEditing(null)}
          onDone={(file) => {
            setEditing(null);
            onPhoto(file);
          }}
        />
      )}
    </>
  );
}
