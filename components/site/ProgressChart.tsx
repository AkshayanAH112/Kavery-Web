"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export type ProgressPoint = {
  key: string;
  name: string;
  date: string;
  model: boolean;
  /** null when the child was absent for the whole exam: a gap in the line, never a 0. */
  percent: number | null;
  classAverage: number | null;
  rank: number | null;
  outOf: number;
};

type Strings = { child: string; classAverage: string; absent: string; model: string; rank: (rank: number, outOf: number) => string; summary: string };

const HEIGHT = 240;
const PAD = { top: 16, right: 44, bottom: 30, left: 36 };
const TICKS = [0, 25, 50, 75, 100];

/** The short stroke that keys a series in the legend and the tooltip. */
const LineKey = ({ average }: { average?: boolean }) => (
  <svg width="18" height="8" className="shrink-0" aria-hidden>
    <line x1="1" y1="4" x2="17" y2="4" stroke={average ? "var(--muted)" : "var(--accent)"} strokeWidth="2" strokeDasharray={average ? "4 3" : undefined} strokeLinecap="round" />
  </svg>
);

const shortDate = (value: string) => new Date(value).toLocaleDateString("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short" });

/**
 * The line through the exams that have a value. An absence is stepped over, never drawn as a 0 —
 * its hollow mark on the baseline says the exam happened.
 */
function line(xs: number[], values: (number | null)[], y: (v: number) => number) {
  let d = "";
  values.forEach((v, i) => {
    if (v !== null) d += `${d ? "L" : "M"}${xs[i].toFixed(1)},${y(v).toFixed(1)}`;
  });
  return d;
}

/**
 * The child's percentage in each published exam, oldest first, against the class average for the
 * same exam. Hand-written SVG (as the console's charts are), drawn at the measured width so the text
 * never scales. Hover, touch or the arrow keys pick an exam; the table beside it carries every value.
 */
export default function ProgressChart({ points, strings }: { points: ProgressPoint[]; strings: Strings }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;
  const xs = points.map((_, i) => PAD.left + (points.length > 1 ? i * step : plotW / 2));
  const y = (v: number) => PAD.top + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;
  // Date labels need ~52px each; on a narrow screen every nth is shown, always including the last.
  const every = Math.max(1, Math.ceil(52 / Math.max(step, 1)));
  const lastSat = points.map((p) => p.percent).findLastIndex((v) => v !== null);

  const nearest = (clientX: number) => {
    const left = box.current?.getBoundingClientRect().left ?? 0;
    const x = clientX - left;
    let best = 0;
    xs.forEach((px, i) => {
      if (Math.abs(px - x) < Math.abs(xs[best] - x)) best = i;
    });
    return best;
  };
  const onPointer = (e: PointerEvent) => setActive(nearest(e.clientX));
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setActive((i) => Math.max(0, Math.min(points.length - 1, (i ?? points.length) + (e.key === "ArrowLeft" ? -1 : 1))));
  };

  // On a phone the readout sits under the chart, always showing an exam (the latest until another is
  // picked) so the page does not jump; wider, it floats beside the crosshair on hover.
  const narrow = width < 480;
  const shown = active === null ? (narrow ? points[points.length - 1] : null) : points[active];
  // The tooltip sits beside the crosshair on the side with more room, so it never covers the point it describes.
  const tipLeft = active === null ? 0 : xs[active] > width / 2 ? Math.max(4, xs[active] - 188) : Math.min(width - 180, xs[active] + 12);

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <li className="inline-flex items-center gap-2">
          <LineKey />
          {strings.child}
        </li>
        <li className="inline-flex items-center gap-2">
          <LineKey average />
          {strings.classAverage}
        </li>
      </ul>

      <div
        ref={box}
        className="relative w-full min-w-0 touch-pan-y overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
        tabIndex={0}
        role="img"
        aria-label={strings.summary}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={HEIGHT} className="block" aria-hidden>
          {TICKS.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {v}%
              </text>
            </g>
          ))}

          {points.map((p, i) =>
            i % every === 0 || i === points.length - 1 ? (
              <text key={p.key} x={xs[i]} y={HEIGHT - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {shortDate(p.date)}
              </text>
            ) : null,
          )}

          {active !== null && <line x1={xs[active]} x2={xs[active]} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--muted)" strokeWidth="1" />}

          <path d={line(xs, points.map((p) => p.classAverage), y)} fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d={line(xs, points.map((p) => p.percent), y)} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {points.map((p, i) =>
            p.percent === null ? (
              // Absent: a hollow mark on the baseline, so the exam is not silently missing.
              <circle key={p.key} cx={xs[i]} cy={y(0)} r={4} fill="var(--surface)" stroke="var(--muted)" strokeWidth="1.5" />
            ) : (
              <circle
                key={p.key}
                cx={xs[i]}
                cy={y(p.percent)}
                r={active === i ? 6 : p.model ? 5 : 4}
                fill={p.model ? "var(--surface)" : "var(--accent)"}
                stroke={p.model ? "var(--accent)" : "var(--surface)"}
                strokeWidth="2"
              />
            ),
          )}

          {/* One direct label: the latest mark, at the end of its line. */}
          {lastSat >= 0 && (
            <text x={xs[lastSat] + 9} y={y(points[lastSat].percent!)} dy="0.32em" className="fill-fg text-xs font-bold tabular-nums">
              {points[lastSat].percent}%
            </text>
          )}
        </svg>

        {shown && (
          <div
            className={narrow ? "mt-2 rounded-(--card-radius) border border-line bg-surface-2 p-3 text-xs" : "pointer-events-none absolute top-0 z-10 w-44 rounded-(--card-radius) border border-line bg-surface-2 p-3 text-xs shadow-lg"}
            style={narrow ? undefined : { left: tipLeft }}
            aria-hidden
          >
            <p className="font-bold wrap-break-word text-fg">{shown.name}</p>
            <p className="text-muted-foreground">
              {shortDate(shown.date)}
              {shown.model ? ` · ${strings.model}` : ""}
            </p>
            {shown.percent === null ? (
              <p className="mt-2 font-semibold text-fg">{strings.absent}</p>
            ) : (
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <LineKey />
                  {strings.child}
                </dt>
                <dd className="text-right font-bold tabular-nums text-fg">{shown.percent}%</dd>
                <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <LineKey average />
                  {strings.classAverage}
                </dt>
                <dd className="text-right tabular-nums text-fg">{shown.classAverage === null ? "—" : `${shown.classAverage}%`}</dd>
                {shown.rank !== null && <dd className="col-span-2 mt-1 font-semibold text-fg">{strings.rank(shown.rank, shown.outOf)}</dd>}
              </dl>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
