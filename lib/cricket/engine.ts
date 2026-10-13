/**
 * Cricket scoring engine — pure functions, no mongoose, no Next.
 *
 * A match stores only its deliveries (`Ball[]` per innings). Every number shown
 * anywhere — totals, the scorecard, bowling figures, fall of wickets, the points
 * table, career stats — is derived from those deliveries here. Nothing derived
 * is the source of truth, which is what makes Undo trivial (drop the last ball)
 * and makes a scoring-rule fix apply retroactively to every match already played.
 *
 * Kept free of server imports so client components can share the types and
 * constants without pulling mongoose into the browser bundle (same reason
 * lib/post-categories.ts sits outside models/index.ts).
 */

export const BALLS_PER_OVER = 6;

export const EXTRA_TYPES = ['wd', 'nb', 'b', 'lb'] as const;
export type ExtraType = (typeof EXTRA_TYPES)[number];

// Retired hurt is deliberately not here: it is not a dismissal and not a
// delivery. The scorer swaps the batter, and the engine reports anyone who is
// neither out nor at the crease as retired.
export const WICKET_KINDS = ['bowled', 'caught', 'lbw', 'stumped', 'run_out', 'hit_wicket'] as const;
export type WicketKind = (typeof WICKET_KINDS)[number];

/** Dismissals that go in the bowler's wickets column. A run out never does. */
export const BOWLER_WICKET_KINDS: readonly WicketKind[] = ['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket'];

export const PLAYER_ROLES = ['batter', 'bowler', 'all_rounder', 'wicket_keeper'] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];

export const MATCH_STATUSES = ['upcoming', 'live', 'innings_break', 'completed', 'abandoned'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const TOURNAMENT_STATUSES = ['upcoming', 'ongoing', 'completed'] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export const RESULT_OUTCOMES = ['win', 'tie', 'no_result', 'abandoned'] as const;
export type ResultOutcome = (typeof RESULT_OUTCOMES)[number];

export interface Wicket {
  kind: WicketKind;
  playerOut: string;
  fielder?: string | null;
}

/**
 * One delivery. `batRuns` are credited to the striker; `extraRuns` is the whole
 * extras figure for the ball, *including* the one-run wide/no-ball penalty — so
 * a wide the batters ran two on is `{ extraType: 'wd', extraRuns: 3 }`.
 */
export interface Ball {
  striker: string;
  nonStriker: string;
  bowler: string;
  batRuns: number;
  extraType?: ExtraType | null;
  extraRuns: number;
  wicket?: Wicket | null;
}

export const isLegal = (ball: Ball) => ball.extraType !== 'wd' && ball.extraType !== 'nb';
export const ballTotal = (ball: Ball) => ball.batRuns + ball.extraRuns;

/** Runs conceded by the bowler: byes and leg byes are not theirs. */
const bowlerRuns = (ball: Ball) =>
  ball.batRuns + (ball.extraType === 'wd' || ball.extraType === 'nb' ? ball.extraRuns : 0);

/** Runs the batters physically completed — the parity of this decides the strike. */
function runsRan(ball: Ball) {
  if (ball.extraType === 'wd') return ball.extraRuns - 1;
  if (ball.extraType === 'b' || ball.extraType === 'lb') return ball.extraRuns;
  return ball.batRuns;
}

export const oversText = (legalBalls: number) =>
  `${Math.floor(legalBalls / BALLS_PER_OVER)}.${legalBalls % BALLS_PER_OVER}`;

const round2 = (n: number) => Math.round(n * 100) / 100;

export const runRate = (runs: number, legalBalls: number) =>
  legalBalls > 0 ? round2((runs * BALLS_PER_OVER) / legalBalls) : null;

export type BallLabelKind = 'dot' | 'run' | 'four' | 'six' | 'wicket' | 'extra';
export interface BallLabel {
  text: string;
  kind: BallLabelKind;
}

/** The short token shown in "this over": •, 1, 4, 6, W, Wd, Nb+4, 2b … */
export function ballLabel(ball: Ball): BallLabel {
  let text: string;
  let kind: BallLabelKind;
  if (ball.extraType === 'wd') {
    text = ball.extraRuns > 1 ? `Wd+${ball.extraRuns - 1}` : 'Wd';
    kind = 'extra';
  } else if (ball.extraType === 'nb') {
    text = ball.batRuns > 0 ? `Nb+${ball.batRuns}` : 'Nb';
    kind = 'extra';
  } else if (ball.extraType === 'b' || ball.extraType === 'lb') {
    text = `${ball.extraRuns}${ball.extraType}`;
    kind = 'extra';
  } else if (ball.batRuns === 0) {
    text = '•';
    kind = 'dot';
  } else {
    text = String(ball.batRuns);
    kind = ball.batRuns === 4 ? 'four' : ball.batRuns === 6 ? 'six' : 'run';
  }
  // A wicket with runs on the same ball (a run out on the second, a stumping
  // off a wide) keeps the runs visible: "1+W", "Wd+W".
  if (ball.wicket) return { text: kind === 'dot' ? 'W' : `${text}+W`, kind: 'wicket' };
  return { text, kind };
}

/**
 * Who is where once a delivery is complete. A null slot is a batter the scorer
 * still has to send in; a null bowler is an over that has just ended.
 *
 * Run-outs are resolved by run parity plus "the incoming batter takes the
 * dismissed batter's end" — the scorer has a Swap Strike button for the cases
 * where the batters had crossed differently.
 */
export function positionsAfterBall(ball: Ball, overComplete: boolean) {
  let striker: string | null = ball.striker;
  let nonStriker: string | null = ball.nonStriker;
  if (runsRan(ball) % 2 === 1) [striker, nonStriker] = [nonStriker, striker];
  if (ball.wicket) {
    if (striker === ball.wicket.playerOut) striker = null;
    else if (nonStriker === ball.wicket.playerOut) nonStriker = null;
  }
  if (overComplete) [striker, nonStriker] = [nonStriker, striker];
  return { striker, nonStriker, bowler: overComplete ? null : ball.bowler };
}

export interface BatterLine {
  id: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number | null;
  out: { kind: WicketKind; bowler: string | null; fielder: string | null } | null;
  /** Currently in the middle (or, in a closed innings, one of the not-out pair). */
  atCrease: boolean;
  /** Not out and not at the crease — walked off hurt. */
  retired: boolean;
}

export interface BowlerLine {
  id: string;
  balls: number;
  overs: string;
  maidens: number;
  runs: number;
  wickets: number;
  wides: number;
  noBalls: number;
  dots: number;
  economy: number | null;
}

export interface OverLog {
  no: number;
  bowler: string;
  runs: number;
  wickets: number;
  balls: BallLabel[];
}

export interface FallOfWicket {
  wicket: number;
  runs: number;
  over: string;
  playerOut: string;
}

export interface Partnership {
  batters: [string, string];
  runs: number;
  balls: number;
  /** The wicket that ended it; null while it is unbroken. */
  wicket: number | null;
}

export interface InningsSummary {
  runs: number;
  wickets: number;
  legalBalls: number;
  overs: string;
  runRate: number | null;
  extras: { wd: number; nb: number; b: number; lb: number; total: number };
  batting: BatterLine[];
  bowling: BowlerLine[];
  fallOfWickets: FallOfWicket[];
  partnerships: Partnership[];
  oversLog: OverLog[];
  /** True once the innings cannot continue: overs up, all out, or target passed. */
  complete: boolean;
  allOut: boolean;
  /** The next legal ball is a free hit (the one after a no-ball). */
  freeHit: boolean;
  /** Six legal balls have just been bowled and no ball of the next over yet. */
  overComplete: boolean;
  /** Bowler of the most recent over — may not bowl the next one. */
  lastOverBowler: string | null;
}

export interface InningsLimits {
  maxBalls: number;
  maxWickets: number;
  target?: number | null;
}

export interface CreaseState {
  striker?: string | null;
  nonStriker?: string | null;
}

export function computeInnings(balls: Ball[], limits: InningsLimits, crease: CreaseState = {}): InningsSummary {
  const batters = new Map<string, BatterLine>();
  const bowlers = new Map<string, BowlerLine>();
  const overs: (OverLog & { legal: number; bowlerRuns: number })[] = [];
  const fallOfWickets: FallOfWicket[] = [];
  const partnerships: Partnership[] = [];
  const extras = { wd: 0, nb: 0, b: 0, lb: 0, total: 0 };

  const batter = (id: string) => {
    let line = batters.get(id);
    if (!line) {
      line = { id, runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: null, out: null, atCrease: false, retired: false };
      batters.set(id, line);
    }
    return line;
  };
  const bowler = (id: string) => {
    let line = bowlers.get(id);
    if (!line) {
      line = { id, balls: 0, overs: '0.0', maidens: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0, dots: 0, economy: null };
      bowlers.set(id, line);
    }
    return line;
  };

  let runs = 0;
  let wickets = 0;
  let legal = 0;
  let freeHit = false;
  let stand: Partnership | null = null;

  for (const ball of balls) {
    const striker = batter(ball.striker);
    batter(ball.nonStriker);
    const bowling = bowler(ball.bowler);
    const legalBall = isLegal(ball);
    const total = ballTotal(ball);

    const overIndex = Math.floor(legal / BALLS_PER_OVER);
    let over = overs[overIndex];
    if (!over) {
      over = { no: overIndex + 1, bowler: ball.bowler, runs: 0, wickets: 0, balls: [], legal: 0, bowlerRuns: 0 };
      overs[overIndex] = over;
    }

    // A changed pair starts a new stand; a batter retiring hurt ends the old
    // one without a wicket, which is why this compares the pair, not wickets.
    if (!stand || !stand.batters.includes(ball.striker) || !stand.batters.includes(ball.nonStriker)) {
      if (stand) partnerships.push(stand);
      stand = { batters: [ball.striker, ball.nonStriker], runs: 0, balls: 0, wicket: null };
    }

    runs += total;
    over.runs += total;
    over.bowlerRuns += bowlerRuns(ball);
    stand.runs += total;

    // A wide is not a ball faced; a no-ball is.
    if (ball.extraType !== 'wd') {
      striker.balls += 1;
      stand.balls += 1;
    }
    striker.runs += ball.batRuns;
    if (ball.batRuns === 4) striker.fours += 1;
    if (ball.batRuns === 6) striker.sixes += 1;

    if (ball.extraType) {
      extras[ball.extraType] += ball.extraRuns;
      extras.total += ball.extraRuns;
    }

    bowling.runs += bowlerRuns(ball);
    if (ball.extraType === 'wd') bowling.wides += ball.extraRuns;
    if (ball.extraType === 'nb') bowling.noBalls += 1;
    if (legalBall) {
      bowling.balls += 1;
      if (total === 0) bowling.dots += 1;
    }

    if (ball.wicket) {
      wickets += 1;
      over.wickets += 1;
      const credited = BOWLER_WICKET_KINDS.includes(ball.wicket.kind);
      if (credited) bowling.wickets += 1;
      batter(ball.wicket.playerOut).out = {
        kind: ball.wicket.kind,
        bowler: credited ? ball.bowler : null,
        fielder: ball.wicket.fielder ?? null,
      };
      const ballsAfter = legal + (legalBall ? 1 : 0);
      fallOfWickets.push({ wicket: wickets, runs, over: oversText(ballsAfter), playerOut: ball.wicket.playerOut });
      stand.wicket = wickets;
      partnerships.push(stand);
      stand = null;
    }

    over.balls.push(ballLabel(ball));
    if (legalBall) {
      legal += 1;
      over.legal += 1;
    }

    // A wide bowled on a free hit leaves the free hit standing.
    freeHit = ball.extraType === 'nb' ? true : ball.extraType === 'wd' ? freeHit : false;
  }
  if (stand) partnerships.push(stand);

  for (const over of overs) {
    if (over.legal === BALLS_PER_OVER && over.bowlerRuns === 0) bowler(over.bowler).maidens += 1;
  }

  // Batters sent in but yet to face still belong on the card.
  for (const id of [crease.striker, crease.nonStriker]) {
    if (id) batter(id);
  }
  for (const line of batters.values()) {
    line.strikeRate = line.balls > 0 ? round2((line.runs * 100) / line.balls) : null;
    line.atCrease = !line.out && (line.id === crease.striker || line.id === crease.nonStriker);
    line.retired = !line.out && !line.atCrease;
  }
  for (const line of bowlers.values()) {
    line.overs = oversText(line.balls);
    line.economy = runRate(line.runs, line.balls);
  }

  const allOut = wickets >= limits.maxWickets;
  const last = balls[balls.length - 1];
  const overComplete = legal > 0 && legal % BALLS_PER_OVER === 0 && !!last && isLegal(last);

  return {
    runs,
    wickets,
    legalBalls: legal,
    overs: oversText(legal),
    runRate: runRate(runs, legal),
    extras,
    batting: [...batters.values()],
    bowling: [...bowlers.values()],
    fallOfWickets,
    partnerships,
    oversLog: overs.map(({ no, bowler: b, runs: r, wickets: w, balls: bs }) => ({ no, bowler: b, runs: r, wickets: w, balls: bs })),
    complete: legal >= limits.maxBalls || allOut || (limits.target != null && runs >= limits.target),
    allOut,
    freeHit,
    overComplete,
    lastOverBowler: overs.length ? overs[overs.length - 1].bowler : null,
  };
}
