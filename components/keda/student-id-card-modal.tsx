"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, Printer } from "lucide-react";

type CardStudent = { name: string; qrCode: string; registrationNumber?: string; grade: number; batchId?: { name?: string } | string; photoUrl?: string };

// CR80 card proportions (85.6 × 54 mm) at roughly 300 dpi.
const W = 1012;
const H = 638;
const BLUE = "#003084";
const INK = "#071B45";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Shrinks the font until `text` fits `maxWidth`, down to `min`. Returns the size used. */
function fitText(ctx: CanvasRenderingContext2D, text: string, family: string, weight: number, start: number, min: number, maxWidth: number) {
  let size = start;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  } while (size > min);
  return size;
}

/**
 * A long name gets a smaller size, and past that a second line, rather than
 * being squeezed or cut: the name on a child's card must be whole and readable.
 */
function fitName(ctx: CanvasRenderingContext2D, name: string, family: string, maxWidth: number) {
  const fits = (lines: string[], size: number) => {
    ctx.font = `800 ${size}px ${family}`;
    return lines.every((line) => ctx.measureText(line).width <= maxWidth);
  };
  for (let size = 48; size >= 32; size -= 2) if (fits([name], size)) return { size, lines: [name] };
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return { size: 30, lines: [name] };
  // Break where the two halves are closest in length.
  let split = 1;
  for (let i = 1; i < words.length; i++) {
    const diff = (at: number) => Math.abs(words.slice(0, at).join(" ").length - words.slice(at).join(" ").length);
    if (diff(i) < diff(split)) split = i;
  }
  const lines = [words.slice(0, split).join(" "), words.slice(split).join(" ")];
  for (let size = 36; size > 22; size -= 2) if (fits(lines, size)) return { size, lines };
  return { size: 22, lines };
}

/**
 * The student's card, drawn straight onto a canvas — no template image and no
 * screenshot library, so it prints and downloads at full resolution and the
 * Tamil in a name is set in the site's own Tamil font.
 *
 * The QR code is the student's permanent scan id. It carries no personal data,
 * and the card deliberately shows no phone number or address. The photo is the
 * one added on the student's page; a card without one shows the child's initial.
 */
async function drawCard(canvas: HTMLCanvasElement, student: CardStudent) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const root = getComputedStyle(document.documentElement);
  const family = `${root.getPropertyValue("--font-hanken") || "system-ui"}, ${root.getPropertyValue("--font-anek") || "sans-serif"}, sans-serif`;
  const [logo, qr, photo] = await Promise.all([
    loadImage("/brand/keda-logo.webp"),
    loadImage(await QRCode.toDataURL(student.qrCode, { margin: 1, scale: 12, errorCorrectionLevel: "M" })),
    // Served by the signed-in photo route on this origin, so the canvas stays exportable.
    student.photoUrl ? loadImage(student.photoUrl).catch(() => null) : null,
    document.fonts.load(`700 40px ${family}`, student.name).catch(() => {}),
  ]);

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // Header band
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 0, W, 150);
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(36, 24, 102, 102, 14);
  ctx.fill();
  ctx.drawImage(logo, 42, 30, 90, 90 * (logo.height / logo.width));
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 34px ${family}`;
  ctx.fillText("KAVERY EDUCATION", 164, 70);
  ctx.fillText("DEVELOPMENT ASSOCIATION", 164, 110);
  ctx.fillStyle = "#FBF1B0";
  ctx.font = `600 22px ${family}`;
  ctx.fillText("Periyaneelavanai · Student card", 164, 140);

  // Photo — what lets a teacher match the card to the child holding it. Without one, an initial.
  const px = 48, py = 190, pw = 196, ph = 246;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 14);
  ctx.clip();
  ctx.fillStyle = "#E8ECF4";
  ctx.fillRect(px, py, pw, ph);
  if (photo) {
    // Cover the box without stretching the face.
    const scale = Math.max(pw / photo.width, ph / photo.height);
    const sw = pw / scale, sh = ph / scale;
    ctx.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, px, py, pw, ph);
  } else {
    ctx.fillStyle = "#9AA6C0";
    ctx.font = `800 96px ${family}`;
    ctx.textAlign = "center";
    ctx.fillText(student.name.trim().charAt(0).toUpperCase() || "?", px + pw / 2, py + ph / 2 + 34);
    ctx.textAlign = "left";
  }
  ctx.restore();
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 14);
  ctx.stroke();

  // QR
  const qrSize = 236;
  const qrX = W - qrSize - 48;
  ctx.drawImage(qr, qrX, py, qrSize, qrSize);
  ctx.fillStyle = "#4A5878";
  ctx.font = `600 19px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.fillText(student.qrCode, qrX + qrSize / 2, py + qrSize + 28);
  ctx.textAlign = "left";

  // Details, in the column between the photo and the QR code
  const left = px + pw + 28;
  const textWidth = qrX - 24 - left;
  const label = (text: string, x: number, y: number) => {
    ctx.fillStyle = "#4A5878";
    ctx.font = `600 20px ${family}`;
    ctx.fillText(text, x, y);
  };
  label("NAME", left, 214);
  ctx.fillStyle = INK;
  const name = fitName(ctx, student.name, family, textWidth);
  ctx.font = `800 ${name.size}px ${family}`;
  name.lines.forEach((line, i) => ctx.fillText(line, left, (name.lines.length === 1 ? 264 : 250) + i * (name.size + 6), textWidth));

  label("INDEX NUMBER", left, 346);
  ctx.fillStyle = BLUE;
  fitText(ctx, student.registrationNumber ?? "—", family, 800, 46, 30, textWidth);
  ctx.fillText(student.registrationNumber ?? "—", left, 394, textWidth);

  const batchName = typeof student.batchId === "object" ? student.batchId?.name : undefined;
  label("GRADE", left, 448);
  if (batchName) label("BATCH", left + 120, 448);
  ctx.fillStyle = INK;
  ctx.font = `700 34px ${family}`;
  ctx.fillText(String(student.grade), left, 490);
  if (batchName) {
    fitText(ctx, batchName, family, 700, 34, 20, textWidth - 120);
    ctx.fillText(batchName, left + 120, 490, textWidth - 120);
  }

  // The club's colours as a footer thread back to Kavery Sports Club.
  ctx.fillStyle = "#E00000";
  ctx.fillRect(0, H - 54, W, 40);
  ctx.fillStyle = "#FFF200";
  ctx.fillRect(0, H - 14, W, 14);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 22px ${family}`;
  ctx.fillText("An education project of Kavery Sports Club", left, H - 27);
}

/**
 * Shared by the students list ("Get ID" per row) and the student page, so a
 * card can be re-issued any time after registration, not only once.
 */
export function StudentIdCardModal({ student, onClose }: { student: CardStudent; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    if (canvasRef.current) {
      drawCard(canvasRef.current, student)
        .then(() => active && setReady(true))
        .catch(() => active && setReady(true));
    }
    return () => {
      active = false;
    };
  }, [student]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
          __html: `@media print { body * { visibility: hidden; } #printable-id-card { visibility: visible; position: fixed; left: 0; top: 0; width: 85.6mm; height: 54mm; border: 0; border-radius: 0; } }`,
        }}
      />
      <div role="dialog" aria-modal="true" aria-label={`Student card for ${student.name}`} className="w-full max-w-lg rounded-[var(--card-radius)] border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
          <h3 className="text-lg font-semibold text-foreground">Student card</h3>
          <div className="flex gap-2">
            <button type="button" disabled={!ready} onClick={() => window.print()} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50">
              <Printer size={15} aria-hidden /> Print
            </button>
            <button type="button" disabled={!ready} onClick={download} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
              <Download size={15} aria-hidden /> Download
            </button>
          </div>
        </div>

        <canvas id="printable-id-card" ref={canvasRef} width={W} height={H} className="h-auto w-full rounded-xl border border-border" />

        <button type="button" onClick={onClose} className="mt-5 min-h-11 w-full cursor-pointer rounded-lg border border-border font-semibold hover:bg-muted print:hidden">
          Close
        </button>
      </div>
    </div>
  );
}
