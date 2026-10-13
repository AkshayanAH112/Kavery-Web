"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, Printer } from "lucide-react";

type CardBatch = { name?: string; year?: number; grades?: number[]; autoPromote?: boolean };
type CardStudent = { name: string; qrCode: string; registrationNumber?: string; grade: number; batchId?: CardBatch | string; photoUrl?: string };

/**
 * "4 & 5 (2026/27)" for a student whose batch carries them up through its
 * grades (`autoPromote`): the card is printed once, so it names the whole
 * course rather than a grade that is out of date after January. Any other
 * student — no batch, or a batch that merely teaches two grades side by side —
 * gets their own grade.
 */
function gradeLine(student: CardStudent, batch?: CardBatch) {
  const grades = [...(batch?.grades ?? [])].sort((a, b) => a - b);
  if (!batch?.autoPromote || !batch.year || grades.length < 2 || !grades.includes(student.grade)) return String(student.grade);
  const firstYear = batch.year - (grades.length - 1);
  return `${grades.join(" & ")} (${firstYear}/${String(batch.year % 100).padStart(2, "0")})`;
}

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
  const family = `${root.getPropertyValue("--font-anek") || "sans-serif"}, ${root.getPropertyValue("--font-hanken") || "system-ui"}, sans-serif`;
  const [logo, qr, photo] = await Promise.all([
    loadImage("/brand/keda-logo.webp"),
    loadImage(await QRCode.toDataURL(student.qrCode, { margin: 1, scale: 12, errorCorrectionLevel: "M" })),
    // Served by the signed-in photo route on this origin, so the canvas stays exportable.
    student.photoUrl ? loadImage(student.photoUrl).catch(() => null) : null,
    document.fonts.load(`800 34px ${family}`, "காவேரி கல்விசார் அபிவிருத்தி ஒன்றியம்").catch(() => {}),
    document.fonts.load(`700 40px ${family}`, student.name).catch(() => {}),
    document.fonts.load(`700 20px ${family}`, "பெயர் சுட்டெண் தரம் பிரிவு").catch(() => {}),
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
  ctx.fillText("காவேரி கல்விசார்", 164, 68);
  ctx.fillText("அபிவிருத்தி ஒன்றியம்", 164, 106);
  ctx.fillStyle = "#FBF1B0";
  ctx.font = `700 21px ${family}`;
  ctx.fillText("பெரியநீலாவணை · மாணவர் அடையாள அட்டை", 164, 138);

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
    ctx.fillText(student.name.trim().charAt(0) || "?", px + pw / 2, py + ph / 2 + 34);
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
    ctx.font = `700 20px ${family}`;
    ctx.fillText(text, x, y);
  };
  label("பெயர்", left, 214);
  ctx.fillStyle = INK;
  const name = fitName(ctx, student.name, family, textWidth);
  ctx.font = `800 ${name.size}px ${family}`;
  name.lines.forEach((line, i) => ctx.fillText(line, left, (name.lines.length === 1 ? 264 : 250) + i * (name.size + 6), textWidth));

  label("சுட்டெண்", left, 346);
  ctx.fillStyle = BLUE;
  fitText(ctx, student.registrationNumber ?? "—", family, 800, 46, 30, textWidth);
  ctx.fillText(student.registrationNumber ?? "—", left, 394, textWidth);

  const batch = typeof student.batchId === "object" ? student.batchId : undefined;
  const grade = gradeLine(student, batch);
  label("தரம்", left, 448);
  ctx.fillStyle = INK;
  ctx.font = `700 34px ${family}`;
  // The batch sits beside the grade, after however much room the grade took.
  const batchLeft = left + Math.max(120, Math.ceil(ctx.measureText(grade).width) + 32);
  ctx.fillText(grade, left, 490);
  if (batch?.name) {
    const room = left + textWidth - batchLeft;
    if (room >= 180) {
      label("பிரிவு", batchLeft, 448);
      ctx.fillStyle = INK;
      fitText(ctx, batch.name, family, 700, 34, 20, room);
      ctx.fillText(batch.name, batchLeft, 490, room);
    } else {
      // A grade that spells out the course leaves no room beside it: the batch goes on its own line below.
      ctx.fillStyle = "#4A5878";
      fitText(ctx, batch.name, family, 600, 24, 16, textWidth);
      ctx.fillText(batch.name, left, 528, textWidth);
    }
  }

  // The club's colours as a footer thread back to Kavery Sports Club.
  ctx.fillStyle = "#E00000";
  ctx.fillRect(0, H - 54, W, 40);
  ctx.fillStyle = "#FFF200";
  ctx.fillRect(0, H - 14, W, 14);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 22px ${family}`;
  ctx.fillText("காவேரி விளையாட்டுக் கழகத்தின் கல்விப் பிரிவு", left, H - 27);
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
      <div role="dialog" aria-modal="true" aria-label={`${student.name} - மாணவர் அடையாள அட்டை`} className="w-full max-w-lg rounded-[var(--card-radius)] border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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

        <canvas id="printable-id-card" ref={canvasRef} width={W} height={H} className="h-auto w-full rounded-xl border border-border" />

        <button type="button" onClick={onClose} className="mt-5 min-h-11 w-full cursor-pointer rounded-lg border border-border font-semibold hover:bg-muted print:hidden">
          மூடுக
        </button>
      </div>
    </div>
  );
}
