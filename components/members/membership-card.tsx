"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, Printer } from "lucide-react";

export type CardMember = { fullName: string; memberCode?: string; nic?: string; memberType?: string; photoUrl?: string; validFrom?: string; validUntil?: string };
export type CardContact = { address: string; email: string; phone: string };

// CR80 card proportions (85.6 × 54 mm) at roughly 300 dpi.
const W = 1012;
const H = 638;
const RED = "#E00000";
const YELLOW = "#FFF200";
const INK = "#0B0909";
const GREY = "#62626C";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Shrinks the font until `text` fits `maxWidth`, down to `min`. */
function fitText(ctx: CanvasRenderingContext2D, text: string, family: string, weight: number, start: number, min: number, maxWidth: number) {
  let size = start;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  } while (size > min);
}

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", year: "numeric" }) : "—");

function fontFamily() {
  const root = getComputedStyle(document.documentElement);
  return `${root.getPropertyValue("--font-hanken") || "system-ui"}, ${root.getPropertyValue("--font-anek") || "sans-serif"}, sans-serif`;
}

/**
 * The membership card, drawn straight onto a canvas in the crest's colours — no
 * template artwork and no screenshot library, so it downloads and prints at full
 * resolution and a Tamil name is set in the site's own Tamil font.
 *
 * The member's photo comes from the signed-in file route on this origin, so the
 * canvas stays exportable.
 */
async function drawFront(canvas: HTMLCanvasElement, member: CardMember) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const family = fontFamily();
  const [crest, photo] = await Promise.all([
    loadImage("/brand/ksc-crest.png"),
    member.photoUrl ? loadImage(member.photoUrl).catch(() => null) : null,
    document.fonts.load(`800 40px ${family}`, member.fullName).catch(() => {}),
  ]);

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // Header band
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, W, 150);
  ctx.fillStyle = YELLOW;
  ctx.fillRect(0, 150, W, 8);
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(36, 24, 102, 102, 14);
  ctx.fill();
  const crestH = 90 * (crest.height / crest.width);
  ctx.drawImage(crest, 42, 24 + (102 - crestH) / 2, 90, crestH);
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 44px ${family}`;
  ctx.fillText("KAVERY SPORTS CLUB", 164, 80);
  ctx.fillStyle = YELLOW;
  ctx.font = `600 24px ${family}`;
  ctx.fillText("Periyaneelavanai · Since 1981 · Membership card", 164, 120);

  // Photo
  const px = 48, py = 192, pw = 226, ph = 286;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 16);
  ctx.clip();
  ctx.fillStyle = "#EFEFF2";
  ctx.fillRect(px, py, pw, ph);
  if (photo) {
    // Cover the box without stretching the face.
    const scale = Math.max(pw / photo.width, ph / photo.height);
    const sw = pw / scale, sh = ph / scale;
    ctx.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, px, py, pw, ph);
  } else {
    ctx.fillStyle = "#B4B4BE";
    ctx.font = `800 96px ${family}`;
    ctx.textAlign = "center";
    ctx.fillText(member.fullName.trim().charAt(0).toUpperCase() || "?", px + pw / 2, py + ph / 2 + 34);
    ctx.textAlign = "left";
  }
  ctx.restore();

  // Details
  const left = 316;
  const width = W - left - 48;
  const label = (text: string, x: number, y: number) => {
    ctx.fillStyle = GREY;
    ctx.font = `600 20px ${family}`;
    ctx.fillText(text, x, y);
  };
  label("NAME", left, 218);
  ctx.fillStyle = INK;
  fitText(ctx, member.fullName, family, 800, 48, 26, width);
  ctx.fillText(member.fullName, left, 268, width);

  label("MEMBER ID", left, 326);
  ctx.fillStyle = RED;
  ctx.font = `800 50px ${family}`;
  ctx.fillText(member.memberCode ?? "—", left, 378);

  label("NIC", left, 432);
  if (member.memberType) label("MEMBER TYPE", left + 300, 432);
  ctx.fillStyle = INK;
  ctx.font = `700 30px ${family}`;
  ctx.fillText(member.nic ?? "—", left, 470);
  if (member.memberType) {
    fitText(ctx, member.memberType, family, 700, 30, 20, width - 300);
    ctx.fillText(member.memberType, left + 300, 470, width - 300);
  }

  // Validity
  ctx.fillStyle = INK;
  ctx.fillRect(0, H - 104, W, 104);
  ctx.fillStyle = YELLOW;
  ctx.font = `600 18px ${family}`;
  ctx.fillText("VALID FROM", 48, H - 64);
  ctx.fillText("VALID UNTIL", left, H - 64);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 30px ${family}`;
  ctx.fillText(formatDate(member.validFrom), 48, H - 26);
  ctx.fillText(formatDate(member.validUntil), left, H - 26);
}

async function drawBack(canvas: HTMLCanvasElement, member: CardMember, contact: CardContact) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const family = fontFamily();
  const qr = member.memberCode ? await loadImage(await QRCode.toDataURL(member.memberCode, { margin: 1, scale: 10, errorCorrectionLevel: "M" })) : null;
  await document.fonts.load(`600 24px ${family}`).catch(() => {});

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, W, 40);
  ctx.fillStyle = YELLOW;
  ctx.fillRect(0, 40, W, 8);

  const left = 48;
  const textWidth = qr ? 620 : W - 96;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = `700 28px ${family}`;
  ctx.fillText("This card belongs to Kavery Sports Club.", left, 118, textWidth);
  ctx.fillStyle = GREY;
  ctx.font = `500 24px ${family}`;
  ctx.fillText("It is not transferable. If found, please return it to the club.", left, 158, textWidth);

  let y = 226;
  for (const line of [contact.address, contact.phone, contact.email].filter(Boolean)) {
    ctx.fillStyle = INK;
    fitText(ctx, line, family, 600, 24, 18, textWidth);
    ctx.fillText(line, left, y, textWidth);
    y += 38;
  }

  if (qr) {
    const size = 230;
    const x = W - size - 56;
    ctx.drawImage(qr, x, 84, size, size);
    ctx.fillStyle = GREY;
    ctx.font = "600 22px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(member.memberCode!, x + size / 2, 84 + size + 32);
    ctx.textAlign = "left";
  }

  // Signature lines, left blank for the officers to sign.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.fillStyle = GREY;
  ctx.font = `600 20px ${family}`;
  for (const [x, title] of [[left, "President"], [left + 340, "Secretary"]] as const) {
    ctx.beginPath();
    ctx.moveTo(x, H - 132);
    ctx.lineTo(x + 270, H - 132);
    ctx.stroke();
    ctx.fillText(title, x, H - 102);
  }

  ctx.fillStyle = RED;
  ctx.fillRect(0, H - 54, W, 40);
  ctx.fillStyle = YELLOW;
  ctx.fillRect(0, H - 14, W, 14);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 22px ${family}`;
  ctx.fillText("Kavery Sports Club · Periyaneelavanai · Since 1981", left, H - 27);
}

const actionClass = "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";

/** Both faces of an approved member's card, with download and print. */
export function MembershipCard({ member, contact }: { member: CardMember; contact: CardContact }) {
  const frontRef = useRef<HTMLCanvasElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    if (frontRef.current && backRef.current) {
      Promise.allSettled([drawFront(frontRef.current, member), drawBack(backRef.current, member, contact)]).then(() => active && setReady(true));
    }
    return () => {
      active = false;
    };
  }, [member, contact]);

  const download = (face: "front" | "back") => {
    const canvas = (face === "front" ? frontRef : backRef).current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${member.fullName.replace(/\s+/g, "_")}_KSC_card_${face}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-xs print:border-0 print:p-0 print:shadow-none">
      {/* When printing, show the two faces alone at their real size. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print { body * { visibility: hidden; } #printable-member-card, #printable-member-card * { visibility: visible; } #printable-member-card { position: fixed; left: 0; top: 0; display: block; } #printable-member-card canvas { display: block; width: 85.6mm; height: 54mm; margin: 0 0 6mm; border: 0; border-radius: 0; } }`,
        }}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h2 className="text-lg text-foreground">Membership card</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!ready} onClick={() => download("front")} className={actionClass}>
            <Download size={15} aria-hidden /> Front
          </button>
          <button type="button" disabled={!ready} onClick={() => download("back")} className={actionClass}>
            <Download size={15} aria-hidden /> Back
          </button>
          <button type="button" disabled={!ready} onClick={() => window.print()} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Printer size={15} aria-hidden /> Print
          </button>
        </div>
      </div>
      <div id="printable-member-card" className="grid gap-5 md:grid-cols-2">
        <canvas ref={frontRef} width={W} height={H} aria-label={`Front of the membership card for ${member.fullName}`} className="h-auto w-full rounded-xl border border-border" />
        <canvas ref={backRef} width={W} height={H} aria-label="Back of the membership card" className="h-auto w-full rounded-xl border border-border" />
      </div>
    </div>
  );
}
