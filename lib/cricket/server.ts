/**
 * Database-side helpers shared by the cricket routes. The rules themselves are
 * in engine.ts / scoring.ts / view.ts, which never touch the database.
 *
 * Those pure modules (ported unchanged from KCSC) work on plain "documents":
 * string ids under `_id`, ISO date strings, a team with its players embedded.
 * Everything here converts D1 rows into exactly that shape, so the engine, the
 * views and the scorer UI did not have to change when the storage did.
 */
import { and, asc, desc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb, schema } from "@/lib/db";
import { slugify } from "@/lib/slug";
import type { MatchStatus } from "./engine";
import type { InningsState, MatchResult } from "./scoring";
import { matchView, type MatchDoc, type PlayerDoc, type TeamDoc, type TeamMap, type TournamentDoc } from "./view";

const { cricketTeams: T, cricketPlayers: P, cricketTournaments: TR, cricketMatches: M } = schema;

type TeamRow = typeof T.$inferSelect;
type PlayerRow = typeof P.$inferSelect;
type TournamentRow = typeof TR.$inferSelect;
type MatchRow = typeof M.$inferSelect;

export const isId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{1,64}$/.test(id);
/** KCSC's name for the same check; lib/cricket/team-input.ts still imports it. */
export const isObjectId = isId;

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

/* ------------------------------------------------------------- row → document */

const playerDoc = (p: PlayerRow): PlayerDoc => ({ _id: p.id, name: p.name, role: p.role as PlayerDoc["role"], isCaptain: p.isCaptain, isKeeper: p.isKeeper });

export const teamDoc = (t: TeamRow, players: PlayerRow[]): TeamDoc & { logoPublicId?: string } => ({
  _id: t.id,
  name: t.name,
  shortName: t.shortName ?? undefined,
  color: t.color ?? undefined,
  logoUrl: t.logoUrl ?? undefined,
  logoPublicId: t.logoKey ?? undefined,
  players: players.map(playerDoc),
});

export const tournamentDoc = (t: TournamentRow): TournamentDoc => ({
  _id: t.id,
  name: t.name,
  slug: t.slug,
  season: t.season ?? undefined,
  venue: t.venue ?? undefined,
  oversPerInnings: t.oversPerInnings,
  teams: t.teamIds,
  status: t.status,
  pointsWin: t.pointsWin,
  pointsTie: t.pointsTie,
  pointsNoResult: t.pointsNoResult,
  isPublished: t.isPublished,
  startDate: iso(t.startDate),
  endDate: iso(t.endDate),
});

/** `innings` is absent on list queries; the views used for lists never read it. */
export const matchDoc = (m: Omit<MatchRow, "innings"> & { innings?: unknown[] }): MatchDoc => ({
  _id: m.id,
  tournamentId: m.tournamentId,
  title: m.title ?? undefined,
  teamA: m.teamA,
  teamB: m.teamB,
  squadA: m.squadA,
  squadB: m.squadB,
  oversPerInnings: m.oversPerInnings,
  venue: m.venue ?? undefined,
  startAt: iso(m.startAt),
  status: m.status as MatchStatus,
  toss: m.toss,
  innings: (m.innings ?? []) as InningsState[],
  scores: m.scores,
  result: m.result as MatchResult | null,
  playerOfMatch: m.playerOfMatch,
  isPublished: m.isPublished,
  rev: m.rev,
  updatedAt: m.updatedAt.toISOString(),
});

/* -------------------------------------------------------------------- reads */

export async function loadTeams(ids?: string[]): Promise<TeamMap> {
  const wanted = ids ? [...new Set(ids)].filter(isId) : null;
  if (wanted && wanted.length === 0) return new Map();
  const db = getDb();
  const [teams, players] = await Promise.all([
    db.select().from(T).where(wanted ? inArray(T.id, wanted) : undefined).orderBy(asc(T.name)),
    db.select().from(P).where(wanted ? inArray(P.teamId, wanted) : undefined).orderBy(asc(P.sort)),
  ]);
  return new Map(teams.map((t) => [t.id, teamDoc(t, players.filter((p) => p.teamId === t.id))]));
}

export async function loadTournaments(where?: SQL) {
  const rows = await getDb().select().from(TR).where(where).orderBy(desc(TR.startDate), desc(TR.createdAt));
  return new Map(rows.map((t) => [t.id, tournamentDoc(t)]));
}

export const publishedTournamentsWhere = eq(TR.isPublished, true);

/**
 * What the public may see: a match that is not hidden, and whose tournament —
 * if it has one — has been published.
 */
export function publicMatchWhere(publishedTournamentIds: string[]) {
  const tournamentOk = publishedTournamentIds.length ? or(isNull(M.tournamentId), inArray(M.tournamentId, publishedTournamentIds)) : isNull(M.tournamentId);
  return and(eq(M.isPublished, true), tournamentOk)!;
}

// Every column except `innings`, which holds the whole ball log.
const cardColumns = {
  id: M.id,
  tournamentId: M.tournamentId,
  title: M.title,
  teamA: M.teamA,
  teamB: M.teamB,
  squadA: M.squadA,
  squadB: M.squadB,
  oversPerInnings: M.oversPerInnings,
  venue: M.venue,
  startAt: M.startAt,
  status: M.status,
  toss: M.toss,
  scores: M.scores,
  result: M.result,
  playerOfMatch: M.playerOfMatch,
  isPublished: M.isPublished,
  rev: M.rev,
  createdAt: M.createdAt,
  updatedAt: M.updatedAt,
};

/** Matches without their deliveries — for lists, where `scores` already has the totals. */
export async function findMatchCards(where: SQL | undefined, order: "newest" | "oldest" = "newest", limit = 50) {
  const by = order === "newest" ? [desc(M.startAt), desc(M.createdAt)] : [asc(M.startAt), asc(M.createdAt)];
  const rows = await getDb().select(cardColumns).from(M).where(where).orderBy(...by).limit(limit);
  return rows.map((row) => matchDoc(row));
}

/** Full matches, ball logs included — only for aggregates (points table, player stats). */
export async function findMatches(where: SQL | undefined) {
  const rows = await getDb().select().from(M).where(where).orderBy(asc(M.startAt));
  return rows.map(matchDoc);
}

export async function getMatch(id: string) {
  if (!isId(id)) return null;
  const row = await getDb().query.cricketMatches.findFirst({ where: eq(M.id, id) });
  return row ? matchDoc(row) : null;
}

export async function getTournament(id: string) {
  if (!isId(id)) return null;
  const row = await getDb().query.cricketTournaments.findFirst({ where: eq(TR.id, id) });
  return row ? tournamentDoc(row) : null;
}

export async function uniqueTournamentSlug(name: string, excludeId?: string) {
  const db = getDb();
  const base = slugify(name) || "tournament";
  let candidate = base;
  let n = 2;
  while ((await db.$count(TR, and(eq(TR.slug, candidate), excludeId ? ne(TR.id, excludeId) : undefined))) > 0) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

/** The scorer's view of a match: the public view plus the fields only staff act on. */
export async function adminMatchView(match: MatchDoc) {
  const [teams, tournament] = await Promise.all([loadTeams([match.teamA, match.teamB]), match.tournamentId ? getTournament(match.tournamentId) : null]);
  return {
    ...matchView(match, teams, tournament),
    rev: match.rev ?? 0,
    isPublished: match.isPublished !== false,
    tournamentId: match.tournamentId ?? null,
  };
}

/**
 * Teams have no publish flag of their own. A team is public once it is in a
 * published tournament or has played a public match — otherwise the squad of a
 * tournament still being set up would be readable by guessing ids.
 */
export async function isTeamPublic(teamId: string, published: TournamentDoc[]) {
  if (published.some((t) => t.teams.includes(teamId))) return true;
  const where = and(publicMatchWhere(published.map((t) => t._id)), or(eq(M.teamA, teamId), eq(M.teamB, teamId)));
  return (await getDb().$count(M, where)) > 0;
}

/** Ids of matches whose squads name any of these players. */
export async function matchesNamingPlayers(playerIds: string[]) {
  if (playerIds.length === 0) return [];
  // Squads are JSON arrays, so membership is checked with json_each rather than a join table.
  const list = sql.join(playerIds.map((id) => sql`${id}`), sql`, `);
  return getDb()
    .select({ squadA: M.squadA, squadB: M.squadB })
    .from(M)
    .where(sql`EXISTS (SELECT 1 FROM json_each(${M.squadA}) WHERE value IN (${list})) OR EXISTS (SELECT 1 FROM json_each(${M.squadB}) WHERE value IN (${list}))`);
}

/* ------------------------------------------------------------------- inputs */

/**
 * A JSON request body as a loose object, or null when it is missing or not an
 * object. Deliberately untyped: every field is validated where it is read.
 */
export async function readBody(request: Request): Promise<Record<string, any> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/** A trimmed, length-capped string from a request body — anything else becomes ''. */
export const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** A date from a form field, or null when it is empty or unparseable. */
export function parseDate(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseOvers(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
}

/* ------------------------------------------------------------------ caching */

/**
 * Public cricket reads are polled by every open scoreboard. Holding each
 * response at Cloudflare's edge for a few seconds means a thousand spectators
 * cost one database read per interval rather than a thousand. Nothing public is
 * per-viewer, so caching is safe — never use this for a staff response.
 *
 * A Worker's own responses are not cached automatically, so this goes through
 * the Cache API. Outside the Workers runtime (`next dev`) it simply runs `produce`.
 */
export const LIVE_SECONDS = 4;
export const BROWSE_SECONDS = 20;

export async function cachedJson(request: Request, seconds: number, produce: () => Promise<{ status?: number; body: unknown }>) {
  const edge = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(new URL(request.url).toString(), { method: "GET" });
  // The cache is an optimisation: if it misbehaves, answer from the database rather than fail the request.
  if (edge) {
    const hit = await edge.match(key).catch(() => undefined);
    if (hit) return hit;
  }
  const { status = 200, body } = await produce();
  const response = Response.json(body, {
    status,
    headers: { "Cache-Control": status === 200 ? `public, max-age=0, s-maxage=${seconds}` : "no-store" },
  });
  if (edge && status === 200) getCloudflareContext().ctx.waitUntil(edge.put(key, response.clone()).catch(() => {}));
  return response;
}

/* ------------------------------------------------- filters for public reads */

export const matchStatusIn = (statuses: MatchStatus[]) => inArray(M.status, statuses);
export const matchInvolvesTeam = (teamId: string) => or(eq(M.teamA, teamId), eq(M.teamB, teamId))!;
export const matchInTournament = (tournamentId: string) => and(eq(M.tournamentId, tournamentId), eq(M.isPublished, true))!;

/** Matches whose squads name this player. Squads are JSON arrays, hence json_each. */
export const matchNamesPlayer = (playerId: string) =>
  sql`(EXISTS (SELECT 1 FROM json_each(${M.squadA}) WHERE value = ${playerId}) OR EXISTS (SELECT 1 FROM json_each(${M.squadB}) WHERE value = ${playerId}))`;

/** A public match by id, or null if it is hidden or its tournament is unpublished. */
export async function getPublicMatch(id: string) {
  const match = await getMatch(id);
  if (!match || match.isPublished === false) return null;
  const tournament = match.tournamentId ? await getTournament(match.tournamentId) : null;
  if (match.tournamentId && !tournament?.isPublished) return null;
  return { match, tournament };
}

export async function getPublishedTournamentBySlug(slug: string) {
  const row = await getDb().query.cricketTournaments.findFirst({ where: and(eq(TR.slug, slug), eq(TR.isPublished, true)) });
  return row ? tournamentDoc(row) : null;
}

/** The team a player belongs to, or null. */
export async function findPlayerTeamId(playerId: string) {
  if (!isId(playerId)) return null;
  const row = await getDb().query.cricketPlayers.findFirst({ where: eq(P.id, playerId) });
  return row?.teamId ?? null;
}
