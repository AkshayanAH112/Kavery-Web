/**
 * The paper scorer's sheet, filled in from the deliveries.
 *
 * Pure like engine.ts: it reads the same `Ball[]` and the engine's summary, and
 * adds the three things a scorebook keeps that a scorecard does not — each
 * batter's scoring strokes in order, each bowler's figures over by over, and
 * the score at the end of every over.
 */
import { BALLS_PER_OVER, BOWLER_WICKET_KINDS, isLegal, type Ball, type BatterLine, type InningsSummary } from './engine';

export interface SheetBatter extends BatterLine {
  /** Batting position, 1-based. */
  order: number;
  /** Runs off the bat for every scoring stroke, in order — what the "runs scored" box holds. */
  strokes: number[];
}

export interface SheetBowlerOver {
  runs: number;
  wickets: number;
  /** Six legal balls with nothing conceded. */
  maiden: boolean;
}

export interface SheetBowler {
  id: string;
  /** 1-based, in the order they came on — the number the over strip refers to. */
  order: number;
  overs: SheetBowlerOver[];
  wides: number;
  noBalls: number;
  oversText: string;
  maidens: number;
  runs: number;
  wickets: number;
}

export interface SheetOver {
  no: number;
  /** Team score and wickets at the end of this over. */
  score: number;
  wickets: number;
  /** SheetBowler.order of whoever bowled it. */
  bowler: number;
}

export interface SheetFall {
  wicket: number;
  score: number;
  /** SheetBatter.order of the batter out. */
  batter: number;
}

export interface SheetInnings {
  batters: SheetBatter[];
  bowlers: SheetBowler[];
  overs: SheetOver[];
  falls: SheetFall[];
  extras: InningsSummary['extras'];
  runs: number;
  wickets: number;
  oversText: string;
}

const bowlerRuns = (ball: Ball) =>
  ball.batRuns + (ball.extraType === 'wd' || ball.extraType === 'nb' ? ball.extraRuns : 0);

export function sheetInnings(balls: Ball[], summary: InningsSummary): SheetInnings {
  const strokes = new Map<string, number[]>();
  const bowlerOvers = new Map<string, SheetBowlerOver[]>();
  // `by` is the bowler's id; it becomes their sheet number once the bowlers are numbered.
  const overs: (Omit<SheetOver, 'bowler'> & { by: string })[] = [];

  let score = 0;
  let wickets = 0;
  let legal = 0;
  let over: { bowler: string; runs: number; wickets: number; legal: number } | null = null;

  const closeOver = () => {
    if (!over) return;
    const list = bowlerOvers.get(over.bowler) ?? [];
    list.push({
      runs: over.runs,
      wickets: over.wickets,
      maiden: over.legal === BALLS_PER_OVER && over.runs === 0,
    });
    bowlerOvers.set(over.bowler, list);
    over = null;
  };

  for (const ball of balls) {
    if (!over) over = { bowler: ball.bowler, runs: 0, wickets: 0, legal: 0 };
    score += ball.batRuns + ball.extraRuns;
    over.runs += bowlerRuns(ball);
    if (ball.batRuns > 0) {
      const list = strokes.get(ball.striker) ?? [];
      list.push(ball.batRuns);
      strokes.set(ball.striker, list);
    }
    if (ball.wicket) {
      wickets += 1;
      if (BOWLER_WICKET_KINDS.includes(ball.wicket.kind)) over.wickets += 1;
    }
    if (isLegal(ball)) {
      legal += 1;
      over.legal += 1;
      if (over.legal === BALLS_PER_OVER) {
        overs.push({ no: legal / BALLS_PER_OVER, score, wickets, by: over.bowler });
        closeOver();
      }
    }
  }
  // An over cut short by the end of the innings still goes on the strip.
  if (over) {
    overs.push({ no: Math.floor(legal / BALLS_PER_OVER) + 1, score, wickets, by: over.bowler });
    closeOver();
  }

  const batters: SheetBatter[] = summary.batting.map((line, i) => ({ ...line, order: i + 1, strokes: strokes.get(line.id) ?? [] }));
  const batterOrder = new Map(batters.map((b) => [b.id, b.order]));

  const bowlers: SheetBowler[] = summary.bowling.map((line, i) => ({
    id: line.id,
    order: i + 1,
    overs: bowlerOvers.get(line.id) ?? [],
    wides: line.wides,
    noBalls: line.noBalls,
    oversText: line.overs,
    maidens: line.maidens,
    runs: line.runs,
    wickets: line.wickets,
  }));
  const bowlerOrder = new Map(bowlers.map((b) => [b.id, b.order]));

  return {
    batters,
    bowlers,
    overs: overs.map(({ by, ...o }) => ({ ...o, bowler: bowlerOrder.get(by) ?? 0 })),
    falls: summary.fallOfWickets.map((f) => ({ wicket: f.wicket, score: f.runs, batter: batterOrder.get(f.playerOut) ?? 0 })),
    extras: summary.extras,
    runs: summary.runs,
    wickets: summary.wickets,
    oversText: summary.overs,
  };
}
