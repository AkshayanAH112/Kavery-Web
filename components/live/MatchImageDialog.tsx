"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ImageIcon, Loader2, Share2, X } from "lucide-react";
import type { MatchView } from "@/lib/cricket/view";
import { cn } from "@/lib/utils";
import { drawMatchImage, IMAGE_SIZE, type ImageLabels, type ImageLayout } from "./summary-image";

export interface ImageDialogText {
  open: string;
  title: string;
  summary: string;
  board: string;
  download: string;
  share: string;
  close: string;
}

/**
 * "Share image": a button that opens a preview of the match image in either
 * layout, with Download and (where the device can share files) Share. Used on
 * the public match centre and the scorer's console; it reads only theme tokens,
 * so it takes on whichever theme it sits in.
 */
export function MatchImageDialog({
  match,
  labels,
  text,
  className,
}: {
  match: MatchView;
  labels: ImageLabels;
  text: ImageDialogText;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<ImageLayout>("summary");
  const [ready, setReady] = useState(false);
  const [canShare, setCanShare] = useState(false);

  // Redrawn whenever the dialog is open and the match changes under it (the
  // public page polls), so the image is never a stale score.
  // Labels are rebuilt on every render of the parent; their content is what matters.
  const labelsKey = JSON.stringify(labels);
  useEffect(() => {
    if (!open || !canvasRef.current) return;
    let active = true;
    setReady(false);
    drawMatchImage(canvasRef.current, layout, match, JSON.parse(labelsKey) as ImageLabels).then(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [open, layout, match, labelsKey]);

  const show = () => {
    // Asked here rather than on mount: only a browser can answer, and only once someone wants to share.
    try {
      const probe = new File([""], "probe.png", { type: "image/png" });
      setCanShare(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
    } catch {
      setCanShare(false);
    }
    setOpen(true);
    dialogRef.current?.showModal();
  };
  const hide = () => dialogRef.current?.close();

  const fileName = () => {
    const slug = `${match.teamA.shortName}-v-${match.teamB.shortName}`.replace(/[^\w-]+/g, "").toLowerCase();
    return `${slug}-${layout}.png`;
  };

  const blob = () =>
    new Promise<Blob | null>((resolve) => {
      if (!canvasRef.current) return resolve(null);
      canvasRef.current.toBlob(resolve, "image/png");
    });

  const download = async () => {
    const file = await blob();
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName();
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const share = async () => {
    const file = await blob();
    if (!file) return;
    try {
      await navigator.share({ files: [new File([file], fileName(), { type: "image/png" })], title: labels.headline });
    } catch {
      // Dismissing the share sheet rejects; nothing to report.
    }
  };

  const size = IMAGE_SIZE[layout];
  const button = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50";

  return (
    <>
      <button type="button" onClick={show} className={cn(button, "border border-line bg-surface-2/70 text-fg hover:bg-surface-2", className)}>
        <ImageIcon size={16} aria-hidden /> {text.open}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialogRef.current && hide()}
        aria-label={text.title}
        className="m-auto max-h-[94dvh] w-[min(64rem,94vw)] overflow-hidden rounded-2xl border border-line bg-surface p-0 text-fg backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="flex max-h-[94dvh] flex-col">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <h2 className="min-w-0 flex-1 truncate font-bold">{text.title}</h2>
            <button type="button" onClick={hide} aria-label={text.close} className="flex size-11 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-fg">
              <X size={20} aria-hidden />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-4 pt-3" role="radiogroup" aria-label={text.title}>
            {(["summary", "board"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={layout === key}
                onClick={() => setLayout(key)}
                className={cn(
                  button,
                  "min-h-10 border",
                  layout === key ? "border-transparent bg-fg text-bg" : "border-line text-muted-foreground hover:text-fg"
                )}
              >
                {text[key]}
                <span className="text-xs font-semibold opacity-70">{key === "summary" ? "4:5" : "16:9"}</span>
              </button>
            ))}
          </div>

          <div className="relative min-h-0 flex-1 overflow-auto p-4">
            <canvas
              ref={canvasRef}
              width={size.w}
              height={size.h}
              aria-label={labels.headline}
              className={cn("mx-auto block h-auto max-w-full rounded-lg bg-black", layout === "summary" ? "max-h-[62dvh] w-auto" : "w-full")}
            />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center" role="status">
                <Loader2 className="animate-spin text-muted-foreground" size={28} aria-hidden />
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">
            {canShare && (
              <button type="button" disabled={!ready} onClick={share} className={cn(button, "border border-line text-fg hover:bg-surface-2")}>
                <Share2 size={16} aria-hidden /> {text.share}
              </button>
            )}
            <button type="button" disabled={!ready} onClick={download} className={cn(button, "bg-brand text-on-brand hover:opacity-90")}>
              <Download size={16} aria-hidden /> {text.download}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
