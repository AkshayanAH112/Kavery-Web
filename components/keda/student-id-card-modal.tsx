"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, Printer } from "lucide-react";

type CardBatch = { name?: string; year?: number };
type CardStudent = { name: string; qrCode: string; registrationNumber?: string; grade: number; batchId?: CardBatch | string; photoUrl?: string };

// Match the supplied artwork exactly; keep its aspect ratio in preview and print.
const W = 1011;
const H = 639;
const BLUE = "#003084";
const INK = "#071B45";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to load the ID card image"));
    img.src = src;
  });
}

// The details column: right of the photo frame, left of the QR frame, as tall as the photo frame.
const TEXT_LEFT = 280;
const TEXT_WIDTH = 438;
const AREA_TOP = 262;
const AREA_BOTTOM = 542;
const LABEL_SIZE = 22;
const LABEL_LINE = 30;
const ROW_GAP = 16;
const VALUE_LINE = 1.3; // × the value size; Tamil vowel signs reach well above and below the letters.

type DetailLine = { label: string; labelFamily: string; values: string[]; family: string };

/** Split a long name into two lines of about equal width, at a space. */
function splitName(ctx: CanvasRenderingContext2D, name: string) {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return [name];
  const width = (from: number, to?: number) => ctx.measureText(words.slice(from, to).join(" ")).width;
  let split = 1;
  for (let i = 2; i < words.length; i++) if (Math.abs(width(0, i) - width(i)) < Math.abs(width(0, split) - width(split))) split = i;
  return [words.slice(0, split).join(" "), words.slice(split).join(" ")];
}

/**
 * Name, index number and batch share one value size — the largest at which all
 * three fit — and one spacing, so the three lines read as a set. A long name
 * wraps onto a second line at that same size instead of shrinking on its own.
 */
function layoutDetails(ctx: CanvasRenderingContext2D, name: string, indexNumber: string, batchName: string, tamil: string, english: string) {
  const fits = (text: string, family: string, size: number) => {
    ctx.font = `700 ${size}px ${family}`;
    return ctx.measureText(text).width <= TEXT_WIDTH;
  };
  const heightOf = (lines: DetailLine[], size: number) => lines.length * LABEL_LINE + lines.reduce((n, l) => n + l.values.length, 0) * size * VALUE_LINE + (lines.length - 1) * ROW_GAP;

  for (let size = 34; size >= 22; size -= 1) {
    if (!fits(indexNumber, english, size) || !fits(batchName, english, size)) continue;
    ctx.font = `700 ${size}px ${tamil}`;
    const nameLines = fits(name, tamil, size) ? [name] : splitName(ctx, name);
    if (!nameLines.every((line) => fits(line, tamil, size))) continue;
    const lines: DetailLine[] = [
      { label: "பெயர்", labelFamily: tamil, values: nameLines, family: tamil },
      { label: "சுட்டெண்", labelFamily: tamil, values: [indexNumber], family: english },
      { label: "Batch", labelFamily: english, values: [batchName], family: english },
    ];
    if (heightOf(lines, size) <= AREA_BOTTOM - AREA_TOP || size === 22) return { size, lines, height: heightOf(lines, size) };
  }
  // Nothing fits even at the smallest size: draw it there, squeezed to the column width.
  const lines: DetailLine[] = [
    { label: "பெயர்", labelFamily: tamil, values: [name], family: tamil },
    { label: "சுட்டெண்", labelFamily: tamil, values: [indexNumber], family: english },
    { label: "Batch", labelFamily: english, values: [batchName], family: english },
  ];
  return { size: 22, lines, height: heightOf(lines, 22) };
}

/** Overlay the student's details on the supplied artwork, retaining its photo and QR frames. */
async function drawCard(canvas: HTMLCanvasElement, student: CardStudent) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  const root = getComputedStyle(document.documentElement);
  const englishFamily = `${root.getPropertyValue("--font-hanken").trim() || "system-ui"}, sans-serif`;
  const tamilFamily = `${root.getPropertyValue("--font-anek").trim() || "sans-serif"}, ${englishFamily}`;
  const batch = typeof student.batchId === "object" ? student.batchId : undefined;
  const batchName = batch?.name?.trim() || (batch?.year ? String(batch.year) : "—");
  const indexNumber = student.registrationNumber?.trim() || "—";
  const [template, qr, photo] = await Promise.all([
    loadImage("/brand/keda-id-card-template.png"),
    QRCode.toDataURL(student.qrCode, { margin: 4, scale: 12, errorCorrectionLevel: "M" }).then(loadImage),
    // The signed-in photo route is on this origin, so downloads remain exportable.
    student.photoUrl ? loadImage(student.photoUrl).catch(() => null) : null,
    document.fonts.load(`700 38px ${tamilFamily}`, `${student.name} பெயர் சுட்டெண்`),
    document.fonts.load(`600 22px ${tamilFamily}`, "பெயர் சுட்டெண்"),
    document.fonts.load(`700 34px ${englishFamily}`, `${indexNumber} ${batchName}`),
    document.fonts.load(`600 22px ${englishFamily}`, "Batch"),
  ]);

  ctx.drawImage(template, 0, 0, W, H);

  // Preserve the artwork's photo placeholder when no student photo is available.
  if (photo) {
    const x = 41, y = 264, width = 210, height = 276;
    const scale = Math.max(width / photo.width, height / photo.height);
    const sw = width / scale, sh = height / scale;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 12);
    ctx.clip();
    ctx.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, x, y, width, height);
    ctx.restore();
  }

  // A four-module white quiet zone keeps the QR readable over the watermark.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, 751, 288, 216, 216);
  ctx.imageSmoothingEnabled = true;

  // Each line is drawn on the middle of its own band, so Tamil and English sit at the same height.
  const { size, lines, height } = layoutDetails(ctx, student.name, indexNumber, batchName, tamilFamily, englishFamily);
  ctx.textBaseline = "middle";
  let y = AREA_TOP + (AREA_BOTTOM - AREA_TOP - height) / 2;
  for (const line of lines) {
    ctx.fillStyle = BLUE;
    ctx.font = `600 ${LABEL_SIZE}px ${line.labelFamily}`;
    ctx.fillText(line.label, TEXT_LEFT, y + LABEL_LINE / 2);
    y += LABEL_LINE;
    ctx.fillStyle = INK;
    ctx.font = `700 ${size}px ${line.family}`;
    for (const value of line.values) {
      ctx.fillText(value, TEXT_LEFT, y + (size * VALUE_LINE) / 2, TEXT_WIDTH);
      y += size * VALUE_LINE;
    }
    y += ROW_GAP;
  }
}

/**
 * Shared by the students list ("Get ID" per row) and the student page, so a
 * card can be re-issued any time after registration, not only once.
 */
export function StudentIdCardModal({ student, onClose }: { student: CardStudent; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState<{ student: CardStudent; status: "ready" | "error" } | null>(null);
  const ready = rendered?.student === student && rendered.status === "ready";
  const failed = rendered?.student === student && rendered.status === "error";

  useEffect(() => {
    let active = true;
    // Render offscreen so a late result cannot overwrite a newer student's card.
    const draft = document.createElement("canvas");
    draft.width = W;
    draft.height = H;
    drawCard(draft, student)
      .then(() => {
        if (!active) return;
        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) throw new Error("Canvas is unavailable");
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(draft, 0, 0);
        setRendered({ student, status: "ready" });
      })
      .catch(() => active && setRendered({ student, status: "error" }));
    return () => {
      active = false;
    };
  }, [student]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    const link = document.createElement("a");
    link.download = `${student.name.replace(/\s+/g, "_")}_KEDA_card.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 print:bg-white print:p-0" onClick={onClose}>
      {/* When printing, show the card alone at its real size. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print { body * { visibility: hidden; } #printable-id-card { visibility: ${ready ? "visible" : "hidden"}; position: fixed; left: 0; top: 0; width: 85.6mm; height: auto; border: 0; border-radius: 0; } }`,
        }}
      />
      <div role="dialog" aria-modal="true" aria-label={`${student.name} - மாணவர் அடையாள அட்டை`} className="w-full max-w-lg rounded-(--card-radius) border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
          <h3 className="text-lg font-semibold text-foreground">மாணவர் அடையாள அட்டை</h3>
          <div className="flex gap-2">
            <button type="button" disabled={!ready} onClick={() => window.print()} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50">
              <Printer size={15} aria-hidden /> அச்சிடுக
            </button>
            <button type="button" disabled={!ready} onClick={download} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
              <Download size={15} aria-hidden /> பதிவிறக்குக
            </button>
          </div>
        </div>

        {!ready && <p role={failed ? "alert" : "status"} className="mb-3 text-sm text-muted-foreground print:hidden">{failed ? "அடையாள அட்டையை உருவாக்க முடியவில்லை. மூடிவிட்டு மீண்டும் முயற்சிக்கவும்." : "அடையாள அட்டை தயாராகிறது…"}</p>}
        <canvas id="printable-id-card" ref={canvasRef} width={W} height={H} aria-label={`${student.name} - மாணவர் அடையாள அட்டை`} className={`h-auto w-full rounded-xl border border-border ${ready ? "" : "invisible"}`} />

        <button type="button" onClick={onClose} className="mt-5 min-h-11 w-full cursor-pointer rounded-lg border border-border font-semibold hover:bg-muted print:hidden">
          மூடுக
        </button>
      </div>
    </div>
  );
}
