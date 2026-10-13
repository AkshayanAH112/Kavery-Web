/**
 * Read models for the cricket pages — what the API hands to a browser.
 *
 * Everything public is assembled here field by field from the stored match and
 * team documents, never returned as the document itself, so a field added to a
 * schema later cannot leak onto the public site by default (the same stance
 * the parent page (lib/keda/results.ts) takes with `Student`).
 */
import {
  BALLS_PER_OVER,
  oversText,
  runRate,
  type InningsSummary,
  type MatchStatus,
  type PlayerRole,
} from './engine';
import { inningsLimits, summarise, type MatchResult, type MatchState } from './scoring';

export interface PlayerDoc {
  _id: string;
  name: string;
  role?: PlayerRole;
  isCaptain?: boolean;
  isKeeper?: boolean;
}

export interface TeamDoc {
  _id: string;
  name: string;
  shortName?: string;
  color?: string;
  logoUrl?: string;
  players: PlayerDoc[];
}

export interface MatchDoc extends MatchState {
  _id: string;
  tournamentId?: string | null;
  title?: string;
  venue?: string;
  startAt?: string | null;
  playerOfMatch?: string | null;
  isPublished?: boolean;
  rev?: number;
  scores?: { team: string; runs: number; wickets: number; balls: number; allOut?: boolean }[];
  updatedAt?: string;
}

export interface TournamentDoc {
  _id: string;
  name: string;
  slug: string;
  season?: string;
  venue?: string;
  oversPerInnings?: number;
  teams: string[];
  status: string;
  pointsWin: number;
  pointsTie: number;
  pointsNoResult: number;
  isPublished?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

export type TeamMap = Map<string, TeamDoc>;

export interface TeamBrief {
  id: string;
  name: string;
  shortName: string;
  color: string | null;
  logoUrl: string | null;
}

const UNKNOWN_TEAM: TeamBrief = { id: '', name: 'Unknown team', shortName: '—', color: null, logoUrl: null };

export function teamBrief(teams: TeamMap, id: string): TeamBrief {
  const team = teams.get(id);
  if (!team) return { ...UNKNOWN_TEAM, id };
  return {
    id,
    name: team.name,
    // A short name is optional on the form; the first three letters stand in.
    shortName: team.shortName || team.name.slice(0, 3).toUpperCase(),
    color: team.color || null,
    logoUrl: team.logoUrl || null,
  };
}

const tournamentBrief = (t?: TournamentDoc | null) => (t ? { name: t.name, slug: t.slug } : null);

/** A match as a list row: scores come from the denormalised `scores`, no deliveries read. */
export function matchCard(match: MatchDoc, teams: TeamMap, tournament?: TournamentDoc | null) {
  return {
    id: match._id,
    title: match.title || null,
    venue: match.venue || null,
    startAt: match.startAt || null,
    status: match.status as MatchStatus,
    oversPerInnings: match.oversPerInnings,
    tournament: tournamentBrief(tournament),
    teamA: teamBrief(teams, match.teamA),
    teamB: teamBrief(teams, match.teamB),
    scores: (match.scores ?? []).map((s) => ({
      team: s.team,
      runs: s.runs,
      wickets: s.wickets,
      overs: oversText(s.balls),
    })),
    result: resultView(match.result),
  };
}

export type MatchCard = ReturnType<typeof matchCard>;

function resultView(result?: MatchResult | null) {
  if (!result) return null;
  return {
    outcome: result.outcome,
    winner: result.winner ?? null,
    by: result.by ?? null,
    margin: result.margin ?? null,
  };
}

function playersOf(match: MatchDoc, teams: TeamMap) {
  const players: Record<string, { name: string; role: PlayerRole; isCaptain: boolean; isKeeper: boolean; team: string }> = {};
  for (const teamId of [match.teamA, match.teamB]) {
    for (const p of teams.get(teamId)?.players ?? []) {
      players[p._id] = {
        name: p.name,
        role: p.role ?? 'batter',
        isCaptain: !!p.isCaptain,
        isKeeper: !!p.isKeeper,
        team: teamId,
      };
    }
  }
  return players;
}

/** The whole match: both scorecards, the live state, and the chase equation. */
export function matchView(match: MatchDoc, teams: TeamMap, tournament?: TournamentDoc | null) {
  const summaries: InningsSummary[] = match.innings.map((_, i) => summarise(match, i));
  const innings = match.innings.map((inn, i) => ({
    battingTeam: inn.battingTeam,
    bowlingTeam: inn.bowlingTeam,
    isClosed: inn.isClosed,
    ...summaries[i],
  }));

  const index = match.innings.length - 1;
  const current = match.innings[index];
  const summary = summaries[index];
  const isLive = match.status === 'live' && !!current && !current.isClosed;

  let chase: { target: number; runsNeeded: number; ballsLeft: number; requiredRate: number | null } | null = null;
  if (index === 1 && summary) {
    const limits = inningsLimits(match, 1);
    const target = limits.target as number;
    const runsNeeded = Math.max(0, target - summary.runs);
    const ballsLeft = Math.max(0, limits.maxBalls - summary.legalBalls);
    chase = { target, runsNeeded, ballsLeft, requiredRate: runRate(runsNeeded, ballsLeft) };
  }

  return {
    id: match._id,
    title: match.title || null,
    venue: match.venue || null,
    startAt: match.startAt || null,
    status: match.status as MatchStatus,
    oversPerInnings: match.oversPerInnings,
    tournament: tournamentBrief(tournament),
    teamA: teamBrief(teams, match.teamA),
    teamB: teamBrief(teams, match.teamB),
    squadA: match.squadA,
    squadB: match.squadB,
    players: playersOf(match, teams),
    toss: match.toss ? { wonBy: match.toss.wonBy, decision: match.toss.decision } : null,
    innings,
    chase,
    result: resultView(match.result),
    playerOfMatch: match.playerOfMatch || null,
    live: isLive
      ? {
          striker: current.striker,
          nonStriker: current.nonStriker,
          bowler: current.bowler,
          freeHit: summary.freeHit,
          overComplete: summary.overComplete,
          lastOverBowler: summary.lastOverBowler,
        }
      : null,
    updatedAt: match.updatedAt || null,
  };
}

export type MatchView = ReturnType<typeof matchView>;

// ---------------------------------------------------------------------------
// Aggregates: points table and player statistics
// ---------------------------------------------------------------------------

/**
 * How the "most valuable player" figure is built. Published on the stats page
 * next to the ranking — a league table of people needs its basis stated.
 */
export const MVP_POINTS = {
  run: 1,
  four: 1,
  six: 2,
  wicket: 20,
  maiden: 10,
  catch: 8,
  stumping: 8,
  runOut: 8,
} as const;

export interface PlayerTotals {
  id: string;
  matches: number;
  batting: {
    innings: number;
    notOuts: number;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    highest: number;
    highestNotOut: boolean;
    ducks: number;
    average: number | null;
    strikeRate: number | null;
  };
  bowling: {
    innings: number;
    balls: number;
    overs: string;
    maidens: number;
    runs: number;
    wickets: number;
    dots: number;
    wides: number;
    noBalls: number;
    bestWickets: number;
    bestRuns: number;
    economy: number | null;
    average: number | null;
  };
  fielding: { catches: number; stumpings: number; runOuts: number };
  mvp: number;
}

export interface PlayerMatchLine {
  matchId: string;
  startAt: string | null;
  opponent: string;
  batting: { runs: number; balls: number; out: boolean } | null;
  bowling: { overs: string; runs: number; wickets: number } | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const emptyTotals = (id: string): PlayerTotals => ({
  id,
  matches: 0,
  batting: { innings: 0, notOuts: 0, runs: 0, balls: 0, fours: 0, sixes: 0, highest: 0, highestNotOut: false, ducks: 0, average: null, strikeRate: null },
  bowling: { innings: 0, balls: 0, overs: '0.0', maidens: 0, runs: 0, wickets: 0, dots: 0, wides: 0, noBalls: 0, bestWickets: 0, bestRuns: 0, economy: null, average: null },
  fielding: { catches: 0, stumpings: 0, runOuts: 0 },
  mvp: 0,
});

/** A match counts toward statistics once a ball has been bowled in it. */
const hasPlay = (match: MatchDoc) => match.innings.some((i) => i.balls.length > 0);

/**
 * Career (or tournament) figures for every player who appears in `matches`.
 * `logFor`, when given, also returns that one player's match-by-match lines.
 */
export function aggregatePlayers(matches: MatchDoc[], logFor?: string) {
  const totals = new Map<string, PlayerTotals>();
  const log: PlayerMatchLine[] = [];
  const get = (id: string) => {
    let t = totals.get(id);
    if (!t) {
      t = emptyTotals(id);
      totals.set(id, t);
    }
    return t;
  };

  for (const match of matches) {
    if (!hasPlay(match)) continue;
    for (const id of [...match.squadA, ...match.squadB]) get(id).matches += 1;

    const line: PlayerMatchLine | null =
      logFor && (match.squadA.includes(logFor) || match.squadB.includes(logFor))
        ? {
            matchId: match._id,
            startAt: match.startAt || null,
            opponent: match.squadA.includes(logFor) ? match.teamB : match.teamA,
            batting: null,
            bowling: null,
          }
        : null;

    match.innings.forEach((innings, i) => {
      const s = summarise(match, i);

      for (const b of s.batting) {
        const t = get(b.id).batting;
        t.innings += 1;
        t.runs += b.runs;
        t.balls += b.balls;
        t.fours += b.fours;
        t.sixes += b.sixes;
        if (!b.out) t.notOuts += 1;
        else if (b.runs === 0) t.ducks += 1;
        if (b.runs > t.highest || (b.runs === t.highest && !b.out && t.innings > 0)) {
          t.highest = b.runs;
          t.highestNotOut = !b.out;
        }
        if (line && b.id === logFor) line.batting = { runs: b.runs, balls: b.balls, out: !!b.out };
      }

      for (const b of s.bowling) {
        const t = get(b.id).bowling;
        t.innings += 1;
        t.balls += b.balls;
        t.maidens += b.maidens;
        t.runs += b.runs;
        t.wickets += b.wickets;
        t.dots += b.dots;
        t.wides += b.wides;
        t.noBalls += b.noBalls;
        // Best figures: most wickets, then fewest runs.
        const first = t.innings === 1;
        if (first || b.wickets > t.bestWickets || (b.wickets === t.bestWickets && b.runs < t.bestRuns)) {
          t.bestWickets = b.wickets;
          t.bestRuns = b.runs;
        }
        if (line && b.id === logFor) line.bowling = { overs: b.overs, runs: b.runs, wickets: b.wickets };
      }

      for (const ball of innings.balls) {
        const fielder = ball.wicket?.fielder;
        if (!ball.wicket || !fielder) continue;
        const f = get(fielder).fielding;
        if (ball.wicket.kind === 'caught') f.catches += 1;
        else if (ball.wicket.kind === 'stumped') f.stumpings += 1;
        else if (ball.wicket.kind === 'run_out') f.runOuts += 1;
      }
    });

    if (line) log.push(line);
  }

  for (const t of totals.values()) {
    const bat = t.batting;
    const dismissals = bat.innings - bat.notOuts;
    bat.average = dismissals > 0 ? round2(bat.runs / dismissals) : null;
    bat.strikeRate = bat.balls > 0 ? round2((bat.runs * 100) / bat.balls) : null;

    const bowl = t.bowling;
    bowl.overs = oversText(bowl.balls);
    bowl.economy = runRate(bowl.runs, bowl.balls);
    bowl.average = bowl.wickets > 0 ? round2(bowl.runs / bowl.wickets) : null;

    t.mvp =
      bat.runs * MVP_POINTS.run +
      bat.fours * MVP_POINTS.four +
      bat.sixes * MVP_POINTS.six +
      bowl.wickets * MVP_POINTS.wicket +
      bowl.maidens * MVP_POINTS.maiden +
      t.fielding.catches * MVP_POINTS.catch +
      t.fielding.stumpings * MVP_POINTS.stumping +
      t.fielding.runOuts * MVP_POINTS.runOut;
  }

  return { totals, log };
}

export interface PointsRow {
  team: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  points: number;
  netRunRate: number;
  /** Most recent last: W / L / T / N. */
  form: ('W' | 'L' | 'T' | 'N')[];
}

/**
 * League table. Net run rate is runs-per-over scored minus runs-per-over
 * conceded across the tournament, and a side bowled out is charged its full
 * quota of overs rather than the overs it lasted — otherwise collapsing early
 * would flatter a team's rate. Abandoned and no-result matches share points and
 * are left out of NRR entirely.
 */
export function pointsTable(tournament: TournamentDoc, matches: MatchDoc[]): PointsRow[] {
  const rows = new Map<string, PointsRow & { rf: number; bf: number; ra: number; bb: number }>();
  const row = (team: string) => {
    let r = rows.get(team);
    if (!r) {
      r = { team, played: 0, won: 0, lost: 0, tied: 0, noResult: 0, points: 0, netRunRate: 0, form: [], rf: 0, bf: 0, ra: 0, bb: 0 };
      rows.set(team, r);
    }
    return r;
  };
  for (const team of tournament.teams) row(team);

  const finished = matches
    .filter((m) => m.result && (m.status === 'completed' || m.status === 'abandoned'))
    .sort((a, b) => new Date(a.startAt ?? 0).getTime() - new Date(b.startAt ?? 0).getTime());

  for (const match of finished) {
    const result = match.result as MatchResult;
    const a = row(match.teamA);
    const b = row(match.teamB);
    a.played += 1;
    b.played += 1;

    if (result.outcome === 'win' && result.winner) {
      const [winner, loser] = result.winner === match.teamA ? [a, b] : [b, a];
      winner.won += 1;
      winner.points += tournament.pointsWin;
      winner.form.push('W');
      loser.lost += 1;
      loser.form.push('L');
    } else if (result.outcome === 'tie') {
      for (const r of [a, b]) {
        r.tied += 1;
        r.points += tournament.pointsTie;
        r.form.push('T');
      }
    } else {
      for (const r of [a, b]) {
        r.noResult += 1;
        r.points += tournament.pointsNoResult;
        r.form.push('N');
      }
      continue;
    }

    match.innings.forEach((innings, i) => {
      const s = summarise(match, i);
      const balls = s.allOut ? match.oversPerInnings * BALLS_PER_OVER : s.legalBalls;
      const batting = row(innings.battingTeam);
      const bowling = row(innings.bowlingTeam);
      batting.rf += s.runs;
      batting.bf += balls;
      bowling.ra += s.runs;
      bowling.bb += balls;
    });
  }

  return [...rows.values()]
    .map(({ rf, bf, ra, bb, ...r }) => ({
      ...r,
      netRunRate: Math.round(((bf ? (rf * BALLS_PER_OVER) / bf : 0) - (bb ? (ra * BALLS_PER_OVER) / bb : 0)) * 1000) / 1000,
      form: r.form.slice(-5),
    }))
    .sort((x, y) => y.points - x.points || y.netRunRate - x.netRunRate || y.won - x.won);
}
