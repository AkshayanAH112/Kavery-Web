/**
 * Small server-rendered SVG charts. No chart library: these two shapes are all
 * the dashboard needs, and a library would add to a Worker bundle with a size cap.
 * Every chart carries a text summary for screen readers and its numbers are
 * repeated as text beside it — the picture is never the only way to read the data.
 */

export type StackedBar = { label: string; primary: number; secondary: number };

/** Two values stacked per column: the solid part (`primary`) below the muted part (`secondary`). */
export function StackedBars({ data, summary, height = 220 }: { data: StackedBar[]; summary: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.primary + d.secondary));
  const step = 56;
  const barWidth = 12;
  const top = 12;
  const bottom = 28;
  const plot = height - top - bottom;
  const width = data.length * step;
  const ticks = [0, 0.5, 1];

  return (
    <svg role="img" aria-label={summary} viewBox={`0 0 ${width + 36} ${height}`} className="h-auto w-full">
      {ticks.map((t) => {
        const y = top + plot - plot * t;
        return (
          <g key={t}>
            <line x1={32} x2={width + 36} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
            <text x={24} y={y + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {Math.round(max * t)}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = 36 + i * step + (step - barWidth) / 2;
        const primaryH = (d.primary / max) * plot;
        const secondaryH = (d.secondary / max) * plot;
        const base = top + plot;
        return (
          <g key={`${d.label}-${i}`}>
            {d.secondary > 0 && <rect x={x} y={base - primaryH - secondaryH} width={barWidth} height={secondaryH + (d.primary > 0 ? 6 : 0)} rx={6} fill="var(--data-3)" />}
            {d.primary > 0 && <rect x={x} y={base - primaryH} width={barWidth} height={primaryH} rx={6} fill="var(--data-1)" />}
            {d.primary + d.secondary === 0 && <rect x={x} y={base - 3} width={barWidth} height={3} rx={1.5} fill="var(--data-3)" />}
            <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export type Slice = { label: string; value: number; color: string };

export function Donut({ slices, summary, size = 132 }: { slices: Slice[]; summary: string; size?: number }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  // Each slice's start, as a fraction of the ring, computed up front.
  const starts = slices.map((_, i) => slices.slice(0, i).reduce((sum, s) => sum + s.value, 0) / (total || 1));

  return (
    <svg role="img" aria-label={summary} viewBox="0 0 120 120" width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={60} cy={60} r={radius} fill="none" stroke="var(--surface-2)" strokeWidth={14} />
      {total > 0 &&
        slices.map((slice, i) => {
          const length = (slice.value / total) * circumference;
          if (length === 0) return null;
          return (
            <circle
              key={slice.label}
              cx={60}
              cy={60}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={14}
              strokeDasharray={`${Math.max(length - 2, 0)} ${circumference}`}
              strokeDashoffset={-starts[i] * circumference}
              strokeLinecap="butt"
            />
          );
        })}
    </svg>
  );
}
