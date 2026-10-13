/**
 * Match state transitions — what the scorer's buttons do.
 *
 * Pure, like engine.ts: `applyAction` takes a plain match state and returns the
 * next one, so every rule here can be exercised without a database. The route
 * (app/api/cricket/matches/[id]/score) only loads, calls this, and saves.
 */
import {
  BALLS_PER_OVER,
  EXTRA_TYPES,
  WICKET_KINDS,
  computeInnings,
  positionsAfterBall,
  type Ball,
  type ExtraType,
  type InningsLimits,
  type InningsSummary,
  type MatchStatus,
  type ResultOutcome,
  type WicketKind,
} from './engine';

export interface InningsState {
  battingTeam: string;
  bowlingTeam: string;
  striker: string | null;
  nonStriker: string | null;
  bowler: string | null;
  isClosed: boolean;
  balls: Ball[];
}

export interface MatchResult {
  outcome: ResultOutcome;
  winner?: string | null;
  by?: 'runs' | 'wickets' | null;
  margin?: number | null;
  /** Set by hand (abandoned / no result) rather than derived from the scores. */
  manual?: boolean;
}

export interface MatchState {
  teamA: string;
  teamB: string;
  squadA: string[];
  squadB: string[];
  oversPerInnings: number;
  status: MatchStatus;
  toss?: { wonBy: string; decision: 'bat' | 'bowl' } | null;
  innings: InningsState[];
  result?: MatchResult | null;
}

export type ScoreAction =
  | { type: 'start_innings'; toss?: { wonBy: string; decision: 'bat' | 'bowl' } }
  | { type: 'set_players'; striker?: string; nonStriker?: string; bowler?: string }
  | {
      type: 'ball';
      /** Off the bat — or, with a wide/bye/leg bye, the runs the batters ran. */
      runs: number;
      extraType?: ExtraType | null;
      wicket?: { kind: WicketKind; playerOut?: string; fielder?: string | null } | null;
    }
  | { type: 'swap_strike' }
  | { type: 'undo' }
  | { type: 'end_innings' }
  | { type: 'set_result'; outcome: 'abandoned' | 'no_result' | null };

/** A rule the scorer broke — the message is written to be shown to them as-is. */
export class ScoringError extends Error {}

const squadOf = (state: MatchState, team: string) => (team === state.teamA ? state.squadA : state.squadB);

/** Dismissals possible off each kind of delivery. */
const WICKETS_ALLOWED: Record<ExtraType | 'none', readonly WicketKind[]> = {
  none: WICKET_KINDS,
  wd: ['stumped', 'run_out', 'hit_wicket'],
  nb: ['run_out'],
  b: ['run_out'],
  lb: ['run_out'],
};

export function inningsLimits(state: MatchState, index: number): InningsLimits {
  const innings = state.innings[index];
  const squad = squadOf(state, innings.battingTeam);
  // The last batter has no partner, so a side of N is all out at N-1. A squad
  // that was never picked falls back to the usual ten.
  const maxWickets = squad.length >= 2 ? squad.length - 1 : 10;
  const target = index > 0 ? summarise(state, 0).runs + 1 : null;
  return { maxBalls: state.oversPerInnings * BALLS_PER_OVER, maxWickets, target };
}

export function summarise(state: MatchState, index: number): InningsSummary {
  const innings = state.innings[index];
  return computeInnings(innings.balls, inningsLimits(state, index), innings);
}

function autoResult(state: MatchState): MatchResult {
  const first = summarise(state, 0);
  const second = summarise(state, 1);
  const limits = inningsLimits(state, 1);
  if (second.runs > first.runs) {
    return {
      outcome: 'win',
      winner: state.innings[1].battingTeam,
      by: 'wickets',
      margin: limits.maxWickets - second.wickets,
    };
  }
  if (second.runs === first.runs) return { outcome: 'tie', winner: null, by: null, margin: null };
  return { outcome: 'win', winner: state.innings[0].battingTeam, by: 'runs', margin: first.runs - second.runs };
}

/**
 * Brings status / isClosed / result back in line with the deliveries. Called
 * after every action, so no action has to reason about what it just finished.
 */
function sync(state: MatchState) {
  if (state.result?.manual) {
    state.status = state.result.outcome === 'abandoned' ? 'abandoned' : 'completed';
    return;
  }
  if (state.innings.length === 0) {
    state.status = 'upcoming';
    state.result = null;
    return;
  }
  const index = state.innings.length - 1;
  const current = state.innings[index];
  if (!current.isClosed && summarise(state, index).complete) current.isClosed = true;

  if (index === 0) {
    state.status = current.isClosed ? 'innings_break' : 'live';
    state.result = null;
  } else {
    state.status = current.isClosed ? 'completed' : 'live';
    state.result = current.isClosed ? autoResult(state) : null;
  }
}

function openInnings(state: MatchState) {
  const index = state.innings.length - 1;
  const innings = state.innings[index];
  if (!innings) throw new ScoringError('The match has not started yet.');
  if (innings.isClosed) throw new ScoringError('This innings is over.');
  return { innings, index };
}

export function applyAction(input: MatchState, action: ScoreAction): MatchState {
  const state: MatchState = structuredClone(input);

  switch (action.type) {
    case 'start_innings': {
      if (state.innings.length >= 2) throw new ScoringError('Both innings have already been played.');
      if (state.result?.manual) throw new ScoringError('This match has been closed. Reopen it first.');
      if (state.squadA.length < 2 || state.squadB.length < 2) {
        throw new ScoringError('Pick at least two players for each side before starting.');
      }
      if (state.innings.length === 0) {
        const toss = action.toss ?? state.toss;
        if (!toss || ![state.teamA, state.teamB].includes(toss.wonBy) || !['bat', 'bowl'].includes(toss.decision)) {
          throw new ScoringError('Record the toss before starting the match.');
        }
        state.toss = { wonBy: toss.wonBy, decision: toss.decision };
        const other = toss.wonBy === state.teamA ? state.teamB : state.teamA;
        const battingTeam = toss.decision === 'bat' ? toss.wonBy : other;
        const bowlingTeam = battingTeam === state.teamA ? state.teamB : state.teamA;
        state.innings.push({ battingTeam, bowlingTeam, striker: null, nonStriker: null, bowler: null, isClosed: false, balls: [] });
      } else {
        const first = state.innings[0];
        if (!first.isClosed) throw new ScoringError('End the first innings before starting the second.');
        state.innings.push({
          battingTeam: first.bowlingTeam,
          bowlingTeam: first.battingTeam,
          striker: null,
          nonStriker: null,
          bowler: null,
          isClosed: false,
          balls: [],
        });
      }
      break;
    }

    case 'set_players': {
      const { innings, index } = openInnings(state);
      const summary = summarise(state, index);
      const battingSquad = squadOf(state, innings.battingTeam);
      const bowlingSquad = squadOf(state, innings.bowlingTeam);
      const dismissed = new Set(summary.batting.filter((b) => b.out).map((b) => b.id));

      const striker = action.striker ?? innings.striker;
      const nonStriker = action.nonStriker ?? innings.nonStriker;
      for (const id of [action.striker, action.nonStriker]) {
        if (id === undefined) continue;
        if (!battingSquad.includes(id)) throw new ScoringError('That batter is not in the playing squad.');
        if (dismissed.has(id)) throw new ScoringError('That batter is already out.');
      }
      if (striker && nonStriker && striker === nonStriker) {
        throw new ScoringError('The striker and non-striker must be different players.');
      }

      if (action.bowler !== undefined) {
        if (!bowlingSquad.includes(action.bowler)) throw new ScoringError('That bowler is not in the playing squad.');
        if (summary.overComplete && action.bowler === summary.lastOverBowler) {
          throw new ScoringError('A bowler cannot bowl two overs in a row.');
        }
        innings.bowler = action.bowler;
      }
      innings.striker = striker;
      innings.nonStriker = nonStriker;
      break;
    }

    case 'ball': {
      const { innings, index } = openInnings(state);
      if (!innings.striker || !innings.nonStriker) throw new ScoringError('Choose the batters first.');
      if (!innings.bowler) throw new ScoringError('Choose the bowler for this over first.');

      const extraType = action.extraType ?? null;
      if (extraType !== null && !EXTRA_TYPES.includes(extraType)) throw new ScoringError('Unknown extra.');
      const runs = action.runs;
      if (!Number.isInteger(runs) || runs < 0 || runs > 7) throw new ScoringError('Runs must be between 0 and 7.');
      if ((extraType === 'b' || extraType === 'lb') && runs === 0) {
        throw new ScoringError('Byes and leg byes need at least one run.');
      }

      const ball: Ball = {
        striker: innings.striker,
        nonStriker: innings.nonStriker,
        bowler: innings.bowler,
        batRuns: extraType === null || extraType === 'nb' ? runs : 0,
        extraType,
        extraRuns: extraType === 'wd' ? runs + 1 : extraType === 'nb' ? 1 : extraType === null ? 0 : runs,
        wicket: null,
      };

      if (action.wicket) {
        const { kind } = action.wicket;
        if (!WICKET_KINDS.includes(kind)) throw new ScoringError('Unknown dismissal.');
        if (!WICKETS_ALLOWED[extraType ?? 'none'].includes(kind)) {
          throw new ScoringError('That dismissal is not possible off this kind of delivery.');
        }
        // Only a run out can take the non-striker, and only a run out can
        // come with completed runs.
        const playerOut = kind === 'run_out' ? action.wicket.playerOut ?? innings.striker : innings.striker;
        if (playerOut !== innings.striker && playerOut !== innings.nonStriker) {
          throw new ScoringError('The batter given out is not at the crease.');
        }
        if (kind !== 'run_out' && runs > 0) throw new ScoringError('Only a run out can have runs on the same ball.');
        const fielder = action.wicket.fielder || null;
        if (fielder && !squadOf(state, innings.bowlingTeam).includes(fielder)) {
          throw new ScoringError('That fielder is not in the playing squad.');
        }
        ball.wicket = { kind, playerOut, fielder };
      }

      innings.balls.push(ball);
      const after = summarise(state, index);
      const next = positionsAfterBall(ball, after.overComplete);
      innings.striker = next.striker;
      innings.nonStriker = next.nonStriker;
      innings.bowler = next.bowler;
      break;
    }

    case 'swap_strike': {
      const { innings } = openInnings(state);
      [innings.striker, innings.nonStriker] = [innings.nonStriker, innings.striker];
      break;
    }

    case 'end_innings': {
      const { innings } = openInnings(state);
      innings.isClosed = true;
      break;
    }

    case 'set_result': {
      if (action.outcome === null) {
        state.result = null;
      } else {
        state.result = { outcome: action.outcome, winner: null, by: null, margin: null, manual: true };
      }
      break;
    }

    case 'undo': {
      // Each press steps back exactly one thing the scorer did, newest first.
      if (state.result?.manual) {
        state.result = null;
        break;
      }
      const index = state.innings.length - 1;
      const innings = state.innings[index];
      if (!innings) throw new ScoringError('Nothing to undo.');

      const endedByHand = innings.isClosed && !summarise(state, index).complete;
      if (endedByHand) {
        innings.isClosed = false;
      } else if (innings.balls.length > 0) {
        const ball = innings.balls.pop() as Ball;
        innings.striker = ball.striker;
        innings.nonStriker = ball.nonStriker;
        innings.bowler = ball.bowler;
        innings.isClosed = false;
      } else {
        // An innings with no ball bowled: take the innings itself back, which
        // from the first innings returns the match to the toss.
        state.innings.pop();
      }
      break;
    }

    default:
      throw new ScoringError('Unknown action.');
  }

  sync(state);
  return state;
}

/** Per-innings totals denormalised onto the match so list views never load deliveries. */
export function scoreLines(state: MatchState) {
  return state.innings.map((innings, index) => {
    const s = summarise(state, index);
    return { team: innings.battingTeam, runs: s.runs, wickets: s.wickets, balls: s.legalBalls, allOut: s.allOut };
  });
}
