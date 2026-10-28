/**
 * Head-to-head figures for one match, side by side — the broadcast "match
 * statistics" panel and the summary images both read these. Pure, built only
 * from a MatchView, so the browser can call it on every poll.
 */
import { BALLS_PER_OVER } from './engine';
import type { MatchView } from './view';

type Innings = MatchView['innings'][number];

export interface TeamStats {
  runs: number;
  wickets: number;
  runRate: number | null;
  fours: number;
  sixes: number;
  /** Wickets this side took with the ball. */
  wicketsTaken: number;
  dotBalls: number;
  extrasConceded: number;
  bestStand: number;
}

export type StatKey = Exclude<keyof TeamStats, 'wickets'>;

/** The rows of the comparison panel, in the order they are shown. */
export const STAT_ROWS: StatKey[] = ['runs', 'runRate', 'fours', 'sixes', 'wicketsTaken', 'dotBalls', 'extrasConceded', 'bestStand'];

/** Rows where the smaller figure is the better one. */
export const LOWER_IS_BETTER: ReadonlySet<StatKey> = new Set(['extrasConceded']);

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function teamStats(match: MatchView, teamId: string): TeamStats {
  const batting = match.innings.filter((inn) => inn.battingTeam === teamId);
  const bowling = match.innings.filter((inn) => inn.bowlingTeam === teamId);
  const runs = sum(batting.map((i) => i.runs));
  const balls = sum(batting.map((i) => i.legalBalls));
  return {
    runs,
    wickets: sum(batting.map((i) => i.wickets)),
    runRate: balls > 0 ? Math.round((runs * BALLS_PER_OVER * 100) / balls) / 100 : null,
    fours: sum(batting.flatMap((i) => i.batting.map((b) => b.fours))),
    sixes: sum(batting.flatMap((i) => i.batting.map((b) => b.sixes))),
    wicketsTaken: sum(bowling.map((i) => i.wickets)),
    dotBalls: sum(bowling.flatMap((i) => i.bowling.map((b) => b.dots))),
    extrasConceded: sum(bowling.map((i) => i.extras.total)),
    bestStand: Math.max(0, ...batting.flatMap((i) => i.partnerships.map((p) => p.runs))),
  };
}

export interface Performer {
  id: string;
  team: string;
  /** "77*" for a batter, "3-24" for a bowler. */
  figure: string;
  /** Balls faced, or overs bowled, for the small print. */
  detail: string;
}

/** Highest scorers of one innings, best first; ties go to the quicker innings. */
export function topBatters(inn: Innings, limit = 4): Performer[] {
  return [...inn.batting]
    .filter((b) => b.balls > 0 || b.runs > 0)
    .sort((a, b) => b.runs - a.runs || a.balls - b.balls)
    .slice(0, limit)
    .map((b) => ({ id: b.id, team: inn.battingTeam, figure: `${b.runs}${b.out ? '' : '*'}`, detail: `${b.balls}` }));
}

/** Best bowlers of one innings: most wickets, then fewest runs. */
export function topBowlers(inn: Innings, limit = 4): Performer[] {
  return [...inn.bowling]
    .filter((b) => b.balls > 0)
    .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs || b.balls - a.balls)
    .slice(0, limit)
    .map((b) => ({ id: b.id, team: inn.bowlingTeam, figure: `${b.wickets}-${b.runs}`, detail: b.overs }));
}

/** A team colour that still shows up on the night background: dark colours are lifted toward white. */
export function colourOnInk(hex: string | null | undefined, fallback: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  let [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum < 0.3) {
    const t = (0.3 - lum) / 0.3 * 0.55;
    [r, g, b] = [r, g, b].map((c) => Math.round(c + (255 - c) * t));
  }
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
