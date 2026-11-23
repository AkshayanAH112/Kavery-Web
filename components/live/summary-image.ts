/**
 * Match images for sharing — drawn straight onto a canvas in the browser, the
 * way the membership card is (components/members/membership-card.tsx): no
 * server rendering and no screenshot library, so a Tamil name is shaped by the
 * browser in the site's own Tamil font and the PNG is full resolution.
 *
 * Two layouts:
 *  - "summary" 1080×1350, portrait for WhatsApp and Instagram: each innings as
 *    a team bar over its top batters and the bowlers who bowled at them.
 *  - "board"   1920×1080, landscape: the broadcast board — team against team,
 *    match statistics, top performers — over a floodlit ground.
 *
 * Colours are the crest primitives from app/globals.css, repeated here because
 * a canvas cannot read a CSS variable it is not drawn inside.
 */
import { colourOnInk, STAT_ROWS, teamStats, topBatters, topBowlers, type Performer, type StatKey } from "@/lib/cricket/match-stats";
import type { MatchView, TeamBrief } from "@/lib/cricket/view";

export type ImageLayout = "summary" | "board";

export const IMAGE_SIZE: Record<ImageLayout, { w: number; h: number }> = {
  summary: { w: 1080, h: 1350 },
  board: { w: 1920, h: 1080 },
};

export interface ImageLabels {
  summaryTitle: string;
  boardTitle: string;
  friendly: string;
  oversUnit: string;
  versus: string;
  yetToBat: string;
  statsTitle: string;
  stats: Record<StatKey, string>;
  topBatters: string;
  topBowlers: string;
  playerOfMatch: string;
  /** "20 overs a side", already formatted in the page's language. */
  oversASide: string;
  /** The line that says where the match stands: the result, the chase, or the toss. */
  headline: string;
  date: string | null;
}

const INK = "#0B0909";
const INK_900 = "#141011";
const RED = "#E00000";
const YELLOW = "#FFF200";
const PAPER = "#F8F4EF";
const MUTED = "#BDB3B5";
const HAIR = "rgba(255,255,255,0.14)";
const SITE = "periyaneelavanaikaverysports.club";

type Ctx = CanvasRenderingContext2D;
type Logos = Map<string, HTMLImageElement | null>;

interface Fonts {
  display: string;
  body: string;
}

function fonts(): Fonts {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string) => root.getPropertyValue(name).trim();
  const tamil = v("--font-anek") || "sans-serif";
  return {
    display: `${v("--font-shoulders") || "Impact"}, ${tamil}, sans-serif`,
    body: `${v("--font-hanken") || "system-ui"}, ${tamil}, sans-serif`,
  };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Sets the largest font from `size` down to `min` that fits `max` px. */
function fit(ctx: Ctx, text: string, weight: number, size: number, family: string, max: number, min = 14) {
  let s = size;
  for (;;) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= max || s <= min) return s;
    s -= 2;
  }
}

/** Trims `text` with an ellipsis until it fits `max` px in the current font. */
function clip(ctx: Ctx, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** A team crest in a white disc, or the team colour with its short name when none was uploaded. */
function crest(ctx: Ctx, f: Fonts, team: TeamBrief, logo: HTMLImageElement | null | undefined, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (logo) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.clip();
    const box = r * 1.6;
    const scale = Math.min(box / logo.width, box / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    ctx.drawImage(logo, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = team.color || RED;
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fit(ctx, team.shortName, 900, Math.round(r * 0.78), f.display, r * 1.5);
    ctx.fillText(team.shortName, cx, cy + r * 0.04);
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, r * 0.05);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.stroke();
  ctx.restore();
}

/** The crest's two sashes — a wide red band and a thin yellow one at −24°, the site's one decorative idea. */
function sashes(ctx: Ctx, x: number, y: number, width: number, band: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((-24 * Math.PI) / 180);
  ctx.fillStyle = RED;
  ctx.fillRect(-width / 2, -band / 2, width, band);
  ctx.fillStyle = YELLOW;
  ctx.fillRect(-width / 2, band / 2 + band * 0.16, width, band * 0.1);
  ctx.restore();
}

/** "Alex Carey" set as a light first name and a bold surname, as a broadcast caption does. */
function personName(ctx: Ctx, f: Fonts, name: string, x: number, y: number, size: number, max: number, colour: string) {
  const parts = name.trim().split(/\s+/);
  const last = parts.pop() ?? "";
  const first = parts.join(" ");
  ctx.fillStyle = colour;
  ctx.textAlign = "left";
  let s = size;
  for (;;) {
    ctx.font = `400 ${s}px ${f.body}`;
    const firstW = first ? ctx.measureText(`${first} `).width : 0;
    ctx.font = `700 ${s}px ${f.body}`;
    const lastW = ctx.measureText(last).width;
    if (firstW + lastW <= max || s <= size * 0.7) {
      if (first) {
        ctx.font = `400 ${s}px ${f.body}`;
        ctx.fillText(clip(ctx, `${first} `, Math.max(0, max - lastW)), x, y);
      }
      ctx.font = `700 ${s}px ${f.body}`;
      ctx.fillText(clip(ctx, last, max - firstW), x + firstW, y);
      return;
    }
    s -= 2;
  }
}

function glass(ctx: Ctx, x: number, y: number, w: number, h: number, r = 22, strength = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  // A dark frosted base first, so the lights behind a panel do not show through as noise.
  ctx.fillStyle = "rgba(8,8,12,0.62)";
  ctx.fill();
  const fill = ctx.createLinearGradient(0, y, 0, y + h);
  fill.addColorStop(0, `rgba(255,255,255,${0.1 * strength})`);
  fill.addColorStop(1, `rgba(255,255,255,${0.035 * strength})`);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.stroke();
  ctx.restore();
}

interface Prepared {
  match: MatchView;
  labels: ImageLabels;
  logos: Logos;
  f: Fonts;
}

async function prepare(match: MatchView, labels: ImageLabels): Promise<Prepared> {
  const f = fonts();
  const names = Object.values(match.players).map((p) => p.name).join(" ");
  const sample = `${match.teamA.name} ${match.teamB.name} ${names} ${labels.headline} 0123456789`;
  const [crestImg, logoA, logoB] = await Promise.all([
    loadImage("/brand/ksc-crest.png"),
    match.teamA.logoUrl ? loadImage(match.teamA.logoUrl) : null,
    match.teamB.logoUrl ? loadImage(match.teamB.logoUrl) : null,
    ...[900, 800, 700].map((w) => document.fonts.load(`${w} 40px ${f.display}`, sample).catch(() => {})),
    ...[400, 600, 700].map((w) => document.fonts.load(`${w} 24px ${f.body}`, sample).catch(() => {})),
  ]);
  const logos: Logos = new Map([
    ["ksc", crestImg],
    [match.teamA.id, logoA],
    [match.teamB.id, logoB],
  ]);
  return { match, labels, logos, f };
}

const teamOf = (match: MatchView, id: string) => (id === match.teamA.id ? match.teamA : match.teamB);
const nameOf = (match: MatchView, id: string) => match.players[id]?.name ?? "—";

function clubMark(ctx: Ctx, p: Prepared, x: number, y: number, size: number) {
  const img = p.logos.get("ksc");
  if (img) ctx.drawImage(img, x, y, size, size * (img.height / img.width));
  ctx.fillStyle = PAPER;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${Math.round(size * 0.5)}px ${p.f.display}`;
  ctx.fillText("KAVERY SPORTS CLUB", x + size + 16, y + size * 0.52);
  ctx.fillStyle = MUTED;
  ctx.font = `500 ${Math.round(size * 0.3)}px ${p.f.body}`;
  ctx.fillText(SITE, x + size + 16, y + size * 0.92);
}

/* -------------------------------------------------------------- summary */

function drawSummary(ctx: Ctx, p: Prepared) {
  const { match, labels, f } = p;
  const { w: W, h: H } = IMAGE_SIZE.summary;
  const PAD = 64;

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  // A warm red glow from the lower right, like a floodlit stand behind the card.
  const glow = ctx.createRadialGradient(W * 1.05, H * 0.95, 40, W * 1.05, H * 0.95, H * 0.95);
  glow.addColorStop(0, "rgba(224,0,0,0.55)");
  glow.addColorStop(0.55, "rgba(142,0,0,0.18)");
  glow.addColorStop(1, "rgba(11,9,9,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // The sashes stay inside the header: below it they would cross the scorecard rows.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, 330);
  ctx.clip();
  sashes(ctx, W * 0.92, 150, 900, 150);
  ctx.restore();

  const crestImg = p.logos.get("ksc");
  if (crestImg) {
    const size = 200;
    ctx.drawImage(crestImg, W - PAD - size + 14, 54, size, size * (crestImg.height / crestImg.width));
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PAPER;
  fit(ctx, labels.summaryTitle.toUpperCase(), 900, 116, f.display, W - PAD * 2 - 250, 60);
  ctx.fillText(labels.summaryTitle.toUpperCase(), PAD, 170);
  ctx.fillStyle = YELLOW;
  ctx.font = `700 30px ${f.body}`;
  ctx.fillText(clip(ctx, [match.tournament?.name ?? labels.friendly, match.title].filter(Boolean).join(", "), W - PAD * 2 - 250), PAD, 226);
  ctx.fillStyle = MUTED;
  ctx.font = `500 26px ${f.body}`;
  ctx.fillText(clip(ctx, [match.venue, labels.date].filter(Boolean).join(", "), W - PAD * 2 - 420), PAD, 268);

  const order = match.innings.length
    ? [...match.innings.map((inn) => inn.battingTeam), ...[match.teamA.id, match.teamB.id].filter((id) => !match.innings.some((i) => i.battingTeam === id))]
    : match.toss
      ? [match.toss.decision === "bat" ? match.toss.wonBy : match.toss.wonBy === match.teamA.id ? match.teamB.id : match.teamA.id]
          .flatMap((first) => [first, first === match.teamA.id ? match.teamB.id : match.teamA.id])
      : [match.teamA.id, match.teamB.id];

  const ROW = 62;
  const BAR = 86;
  let y = 330;
  for (const teamId of order.slice(0, 2)) {
    const team = teamOf(match, teamId);
    const inn = match.innings.find((i) => i.battingTeam === teamId);

    // Team bar
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, y, W, BAR);
    ctx.fillStyle = colourOnInk(team.color, RED);
    ctx.fillRect(0, y, 14, BAR);
    crest(ctx, f, team, p.logos.get(team.id), PAD + 30, y + BAR / 2, 30);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "right";
    let scoreRight = W - PAD;
    if (inn) {
      ctx.fillStyle = "#4A4446";
      ctx.font = `600 26px ${f.body}`;
      const overs = `${inn.overs} ${labels.oversUnit}`;
      ctx.fillText(overs, scoreRight, y + 56);
      scoreRight -= ctx.measureText(overs).width + 22;
      ctx.fillStyle = INK;
      ctx.font = `900 60px ${f.display}`;
      const score = `${inn.runs}/${inn.wickets}`;
      ctx.fillText(score, scoreRight, y + 64);
      scoreRight -= ctx.measureText(score).width + 30;
    } else {
      ctx.fillStyle = "#4A4446";
      ctx.font = `600 26px ${f.body}`;
      ctx.fillText(labels.yetToBat, scoreRight, y + 54);
      scoreRight -= ctx.measureText(labels.yetToBat).width + 30;
    }
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    const nameX = PAD + 78;
    fit(ctx, team.name.toUpperCase(), 800, 48, f.display, scoreRight - nameX, 28);
    ctx.fillText(team.name.toUpperCase(), nameX, y + 62);
    y += BAR;

    const bats = inn ? topBatters(inn, 4) : [];
    const bowls = inn ? topBowlers(inn, 4) : [];
    const rows = 4;
    const mid = W / 2;
    for (let r = 0; r < rows; r++) {
      const ry = y + r * ROW;
      ctx.fillStyle = r % 2 ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.06)";
      ctx.fillRect(0, ry, W, ROW);
      ctx.fillStyle = HAIR;
      ctx.fillRect(0, ry + ROW - 1, W, 1);
      const line = (perf: Performer | undefined, x0: number, x1: number) => {
        if (!perf) return;
        ctx.textAlign = "right";
        ctx.fillStyle = PAPER;
        ctx.font = `800 40px ${f.display}`;
        ctx.fillText(perf.figure, x1, ry + 45);
        const figW = ctx.measureText(perf.figure).width;
        personName(ctx, f, nameOf(match, perf.id), x0, ry + 42, 31, x1 - x0 - figW - 24, PAPER);
      };
      line(bats[r], PAD, mid - 40);
      line(bowls[r], mid + 24, W - PAD);
    }
    y += rows * ROW + 46;
  }

  // Where the match stands
  ctx.textAlign = "left";
  ctx.fillStyle = YELLOW;
  fit(ctx, labels.headline, 800, 52, f.display, W - PAD * 2, 30);
  ctx.fillText(labels.headline, PAD, y + 26);
  y += 74;
  const pom = match.playerOfMatch && match.players[match.playerOfMatch] ? match.playerOfMatch : null;
  if (pom) {
    ctx.fillStyle = MUTED;
    ctx.font = `600 26px ${f.body}`;
    const label = `${labels.playerOfMatch}: `;
    ctx.fillText(label, PAD, y);
    ctx.fillStyle = PAPER;
    ctx.font = `700 26px ${f.body}`;
    ctx.fillText(clip(ctx, nameOf(match, pom), W - PAD * 2 - ctx.measureText(label).width), PAD + ctx.measureText(label).width + 4, y);
  }

  // Footer
  ctx.fillStyle = INK_900;
  ctx.fillRect(0, H - 104, W, 104);
  ctx.fillStyle = RED;
  ctx.fillRect(0, H - 104, W, 4);
  clubMark(ctx, p, PAD, H - 84, 62);
}

/* ---------------------------------------------------------------- board */

function ground(ctx: Ctx, W: number, H: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#05070C");
  sky.addColorStop(0.55, INK);
  sky.addColorStop(1, "#050404");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // The outfield in perspective, mown in stripes, with the pitch at its centre.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(W / 2, H + 120, W * 0.62, H * 0.5, 0, 0, Math.PI * 2);
  const grass = ctx.createRadialGradient(W / 2, H, 50, W / 2, H, W * 0.6);
  grass.addColorStop(0, "#1B5E2E");
  grass.addColorStop(1, "#0A2814");
  ctx.fillStyle = grass;
  ctx.fill();
  ctx.clip();
  for (let i = -12; i < 12; i++) {
    if (i % 2) continue;
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * 70, H * 0.55);
    ctx.lineTo(W / 2 + (i + 1) * 70, H * 0.55);
    ctx.lineTo(W / 2 + (i + 1) * 230, H + 200);
    ctx.lineTo(W / 2 + i * 230, H + 200);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(W / 2 - 34, H * 0.66);
  ctx.lineTo(W / 2 + 34, H * 0.66);
  ctx.lineTo(W / 2 + 86, H + 40);
  ctx.lineTo(W / 2 - 86, H + 40);
  ctx.closePath();
  ctx.fillStyle = "rgba(214,196,150,0.28)";
  ctx.fill();
  ctx.restore();

  // Floodlights: two pools of light from the corners, and the haze under them.
  for (const x of [W * 0.12, W * 0.88]) {
    const light = ctx.createRadialGradient(x, -60, 10, x, -60, W * 0.42);
    light.addColorStop(0, "rgba(255,250,235,0.34)");
    light.addColorStop(0.35, "rgba(200,220,255,0.08)");
    light.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, W, H);
  }
  // Out-of-focus crowd lights along the stand.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const x = rand() * W;
    const yy = H * 0.3 + rand() * H * 0.22;
    const r = 3 + rand() * 9;
    ctx.fillStyle = `rgba(255,${200 + Math.round(rand() * 55)},${150 + Math.round(rand() * 100)},${0.05 + rand() * 0.12})`;
    ctx.beginPath();
    ctx.arc(x, yy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.65)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

function panelTitle(ctx: Ctx, f: Fonts, text: string, x: number, y: number, w: number) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PAPER;
  fit(ctx, text.toUpperCase(), 800, 34, f.display, w - 40, 22);
  ctx.fillText(text.toUpperCase(), x + w / 2, y);
}

function drawBoard(ctx: Ctx, p: Prepared) {
  const { match, labels, f } = p;
  const { w: W, h: H } = IMAGE_SIZE.board;
  ground(ctx, W, H);

  const a = match.teamA;
  const b = match.teamB;
  const colourA = colourOnInk(a.color, RED);
  const colourB = colourOnInk(b.color, YELLOW);

  // Header
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = YELLOW;
  ctx.font = `700 26px ${f.body}`;
  ctx.fillText(clip(ctx, [match.tournament?.name ?? labels.friendly, match.title].filter(Boolean).join(", "), 900), W / 2, 66);
  ctx.fillStyle = PAPER;
  fit(ctx, labels.boardTitle.toUpperCase(), 900, 54, f.display, 700);
  ctx.fillText(labels.boardTitle.toUpperCase(), W / 2, 116);

  // Centre: team against team
  const cx0 = 600;
  const cw = 720;
  glass(ctx, cx0, 150, cw, 470, 26);
  const crestY = 290;
  for (const [team, x] of [[a, cx0 + 170], [b, cx0 + cw - 170]] as const) {
    crest(ctx, f, team, p.logos.get(team.id), x, crestY, 96);
    ctx.textAlign = "center";
    ctx.fillStyle = PAPER;
    fit(ctx, team.name.toUpperCase(), 800, 40, f.display, 300, 22);
    ctx.fillText(team.name.toUpperCase(), x, crestY + 146);
  }
  ctx.fillStyle = PAPER;
  ctx.font = `900 92px ${f.display}`;
  ctx.textAlign = "center";
  ctx.fillText(labels.versus.toUpperCase(), W / 2, crestY + 32);

  for (const [team, x, colour] of [[a, cx0 + 30, colourA], [b, cx0 + cw / 2 + 10, colourB]] as const) {
    const lines = match.innings.filter((i) => i.battingTeam === team.id);
    const bw = cw / 2 - 40;
    const by = 470;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, by, bw, 124, 16);
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = colour;
    ctx.fillRect(x + 24, by + 14, bw - 48, 4);
    ctx.textAlign = "center";
    ctx.fillStyle = PAPER;
    const score = lines.length ? lines.map((i) => `${i.runs}/${i.wickets}`).join(" & ") : "—";
    fit(ctx, score, 900, 74, f.display, bw - 40, 36);
    ctx.fillText(score, x + bw / 2, by + 80);
    ctx.fillStyle = MUTED;
    ctx.font = `600 22px ${f.body}`;
    ctx.fillText(lines.length ? `${lines[lines.length - 1].overs} ${labels.oversUnit}` : labels.yetToBat, x + bw / 2, by + 112);
  }

  // Where the match stands
  glass(ctx, cx0, 640, cw, 92, 20, 1.4);
  ctx.fillStyle = YELLOW;
  ctx.textAlign = "center";
  fit(ctx, labels.headline, 800, 40, f.display, cw - 60, 22);
  ctx.fillText(labels.headline, W / 2, 700);

  // Details
  glass(ctx, cx0, 752, cw, 108, 20);
  const pom = match.playerOfMatch && match.players[match.playerOfMatch] ? match.playerOfMatch : null;
  const facts = [labels.oversASide, match.venue, labels.date].filter(Boolean).join("   |   ");
  ctx.fillStyle = MUTED;
  ctx.font = `600 22px ${f.body}`;
  ctx.fillText(clip(ctx, facts, cw - 60), W / 2, pom ? 792 : 815);
  if (pom) {
    ctx.fillStyle = PAPER;
    ctx.font = `700 26px ${f.body}`;
    ctx.fillText(clip(ctx, `${labels.playerOfMatch}: ${nameOf(match, pom)}`, cw - 60), W / 2, 834);
  }

  // Left: match statistics
  const lx = 60;
  const lw = 500;
  glass(ctx, lx, 150, lw, 710, 26);
  panelTitle(ctx, f, labels.statsTitle, lx, 206, lw);
  ctx.font = `800 26px ${f.display}`;
  ctx.textAlign = "left";
  ctx.fillStyle = colourA;
  ctx.fillText(a.shortName, lx + 30, 252);
  ctx.textAlign = "right";
  ctx.fillStyle = colourB;
  ctx.fillText(b.shortName, lx + lw - 30, 252);
  const sa = teamStats(match, a.id);
  const sb = teamStats(match, b.id);
  const rowH = 72;
  STAT_ROWS.forEach((key, i) => {
    const ry = 290 + i * rowH;
    const va = sa[key] ?? 0;
    const vb = sb[key] ?? 0;
    ctx.fillStyle = PAPER;
    ctx.font = `800 32px ${f.display}`;
    ctx.textAlign = "left";
    ctx.fillText(String(sa[key] ?? "—"), lx + 30, ry + 26);
    ctx.textAlign = "right";
    ctx.fillText(String(sb[key] ?? "—"), lx + lw - 30, ry + 26);
    ctx.textAlign = "center";
    ctx.fillStyle = MUTED;
    fit(ctx, labels.stats[key], 600, 21, f.body, lw - 200, 14);
    ctx.fillText(labels.stats[key], lx + lw / 2, ry + 22);
    // Each side's bar grows out from the middle in proportion to the larger figure.
    const half = (lw - 60) / 2;
    const top = Math.max(va, vb) || 1;
    const mid = lx + lw / 2;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(lx + 30, ry + 40, lw - 60, 8);
    ctx.fillStyle = colourA;
    ctx.globalAlpha = va >= vb ? 1 : 0.55;
    ctx.fillRect(mid - (va / top) * half, ry + 40, (va / top) * half, 8);
    ctx.fillStyle = colourB;
    ctx.globalAlpha = vb >= va ? 1 : 0.55;
    ctx.fillRect(mid, ry + 40, (vb / top) * half, 8);
    ctx.globalAlpha = 1;
  });

  // Right: top performers across the match
  const rx = W - 60 - 500;
  const rw = 500;
  glass(ctx, rx, 150, rw, 710, 26);
  const bats = match.innings.flatMap((inn) => topBatters(inn, 5)).sort((x, y) => parseInt(y.figure) - parseInt(x.figure)).slice(0, 5);
  const bowls = match.innings
    .flatMap((inn) => topBowlers(inn, 5))
    .sort((x, y) => {
      const [wx, rx2] = x.figure.split("-").map(Number);
      const [wy, ry2] = y.figure.split("-").map(Number);
      return wy - wx || rx2 - ry2;
    })
    .slice(0, 5);
  const list = (title: string, items: Performer[], top: number) => {
    panelTitle(ctx, f, title, rx, top, rw);
    items.forEach((perf, i) => {
      const ry = top + 26 + i * 54;
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.07)";
      ctx.beginPath();
      ctx.roundRect(rx + 24, ry, rw - 48, 46, 10);
      ctx.fill();
      ctx.fillStyle = teamOf(match, perf.team).id === a.id ? colourA : colourB;
      ctx.fillRect(rx + 24, ry + 10, 4, 26);
      ctx.textAlign = "left";
      ctx.fillStyle = MUTED;
      ctx.font = `700 18px ${f.body}`;
      ctx.fillText(teamOf(match, perf.team).shortName, rx + 42, ry + 30);
      ctx.textAlign = "right";
      ctx.fillStyle = PAPER;
      ctx.font = `800 30px ${f.display}`;
      ctx.fillText(perf.figure, rx + rw - 42, ry + 34);
      const figW = ctx.measureText(perf.figure).width;
      personName(ctx, f, nameOf(match, perf.id), rx + 100, ry + 31, 23, rw - 100 - 42 - figW - 18, PAPER);
    });
    if (items.length === 0) {
      ctx.textAlign = "center";
      ctx.fillStyle = MUTED;
      ctx.font = `500 22px ${f.body}`;
      ctx.fillText("—", rx + rw / 2, top + 60);
    }
  };
  list(labels.topBatters, bats, 206);
  list(labels.topBowlers, bowls, 560);

  clubMark(ctx, p, 60, H - 150, 76);
}

/** Draws `layout` for `match` onto `canvas`, sizing it to the layout. */
export async function drawMatchImage(canvas: HTMLCanvasElement, layout: ImageLayout, match: MatchView, labels: ImageLabels) {
  const p = await prepare(match, labels);
  const { w, h } = IMAGE_SIZE[layout];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  if (layout === "summary") drawSummary(ctx, p);
  else drawBoard(ctx, p);
}
