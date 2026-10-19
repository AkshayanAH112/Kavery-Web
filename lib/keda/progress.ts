/**
 * A parent's reading of their child's published results: the current exam, and how the marks are
 * moving. It only rearranges what `studentResults` (lib/keda/results.ts) already worked out, so every
 * rank here is a test's rank from `combineTest` — by marks alone; attendance plays no part in it.
 *
 * Pure: no database, so the parent page runs it in the browser.
 */

export type ProgressInput = {
  testId: string;
  name: string;
  kind: "test" | "model";
  date: string;
  total: number | null;
  maxTotal: number;
  percent: number | null;
  isAbsent: boolean;
  classAverage: number | null;
  rank: number | null;
  outOf: number;
};

export type Trend = "up" | "steady" | "down";

/** A change of less than this many percentage points is "steady": one test's difficulty moves marks that much. */
const STEADY_BAND = 3;
/** The latest test is compared with the average of up to this many before it. */
const TREND_WINDOW = 3;

const sat = (r: ProgressInput) => r.percent !== null;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The most recent published exam and the change since the one before it of the same kind (a model
 * exam is compared with the previous model exam, a test with the previous test). `rankChange` is
 * positive when the child moved up: 5th then 3rd is +2.
 */
export function currentExam<T extends ProgressInput>(results: T[]) {
  const chrono = [...results].sort((a, b) => a.date.localeCompare(b.date));
  const latest = chrono.at(-1);
  if (!latest) return null;
  const previous = chrono.slice(0, -1).filter((r) => r.kind === latest.kind && r.rank !== null).at(-1) ?? null;
  return {
    latest,
    previous,
    rankChange: latest.rank !== null && previous ? previous.rank! - latest.rank : null,
  };
}

/** Each exam's rank change against the previous ranked exam of the same kind, by test id; null for the first. */
export function rankChanges<T extends ProgressInput>(results: T[]) {
  const last = new Map<string, number>();
  const changes = new Map<string, number | null>();
  for (const r of [...results].sort((a, b) => a.date.localeCompare(b.date))) {
    const before = last.get(r.kind);
    changes.set(r.testId, r.rank !== null && before !== undefined ? before - r.rank : null);
    if (r.rank !== null) last.set(r.kind, r.rank);
  }
  return changes;
}

/** How the marks are going, over the exams of one kind the child sat. */
export function marksTrend<T extends ProgressInput>(results: T[]) {
  const chrono = [...results].sort((a, b) => a.date.localeCompare(b.date));
  // Regular tests carry the trend; model exams only when there are not yet two tests to compare.
  const tests = chrono.filter((r) => r.kind === "test" && sat(r));
  const models = chrono.filter((r) => r.kind === "model" && sat(r));
  const series = tests.length >= 2 ? tests : models.length >= 2 ? models : tests;

  let trend: { direction: Trend; change: number; kind: "test" | "model" } | null = null;
  if (series.length >= 2) {
    const latest = series.at(-1)!;
    const before = series.slice(-1 - TREND_WINDOW, -1);
    const change = round1(latest.percent! - before.reduce((sum, r) => sum + r.percent!, 0) / before.length);
    trend = { direction: change >= STEADY_BAND ? "up" : change <= -STEADY_BAND ? "down" : "steady", change, kind: latest.kind };
  }

  const satAll = chrono.filter(sat);
  const best = satAll.reduce<T | null>((top, r) => (!top || r.percent! > top.percent! ? r : top), null);
  const compared = satAll.filter((r) => r.classAverage !== null);
  return {
    trend,
    best,
    sat: satAll.length,
    absent: chrono.filter((r) => r.isAbsent).length,
    aboveAverage: compared.filter((r) => r.percent! > r.classAverage!).length,
    compared: compared.length,
  };
}
