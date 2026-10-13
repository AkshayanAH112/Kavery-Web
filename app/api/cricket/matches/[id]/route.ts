import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { adminMatchView, getMatch, getTournament, isId, loadTeams, parseDate, parseOvers, readBody, text } from "@/lib/cricket/server";

const M = schema.cricketMatches;
const NOT_FOUND = () => Response.json({ error: "Match not found" }, { status: 404 });

export async function GET(_request: Request, { params }: RouteContext<"/api/cricket/matches/[id]">) {
  const auth = await authorize("cricket.score");
  if (!auth.ok) return auth.response;
  const match = await getMatch((await params).id);
  if (!match) return NOT_FOUND();
  return Response.json({ match: await adminMatchView(match) });
}

/**
 * Edits match details. Deliberately has no way to touch `innings`: every
 * delivery is written by the score route, and only there.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/cricket/matches/[id]">) {
  const auth = await authorize("cricket.score");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const match = await getMatch(id);
  if (!match) return NOT_FOUND();
  const data = await readBody(request);
  if (!data) return Response.json({ error: "Invalid request" }, { status: 400 });

  const started = match.innings.length > 0;
  const set: Partial<typeof M.$inferInsert> = {};

  if (data.title !== undefined) set.title = text(data.title, 60) || null;
  if (data.venue !== undefined) set.venue = text(data.venue, 80) || null;
  if (data.isPublished !== undefined) set.isPublished = !!data.isPublished;
  if (data.startAt !== undefined) set.startAt = parseDate(data.startAt);

  if (data.tournamentId !== undefined) {
    if (!data.tournamentId) set.tournamentId = null;
    else if (!(await getTournament(data.tournamentId))) return Response.json({ error: "Tournament not found" }, { status: 404 });
    else set.tournamentId = data.tournamentId;
  }

  if (data.oversPerInnings !== undefined) {
    if (started) return Response.json({ error: "Overs cannot change once the match has started" }, { status: 409 });
    const overs = parseOvers(data.oversPerInnings);
    if (!overs) return Response.json({ error: "Overs per innings must be a whole number from 1 to 50" }, { status: 400 });
    set.oversPerInnings = overs;
  }

  // The squad size sets how many wickets end an innings, so squads lock at the first ball too.
  const squads = { squadA: match.squadA, squadB: match.squadB };
  if (data.squadA !== undefined || data.squadB !== undefined) {
    if (started) return Response.json({ error: "Squads cannot change once the match has started" }, { status: 409 });
    const teams = await loadTeams([match.teamA, match.teamB]);
    for (const [field, teamId] of [["squadA", match.teamA], ["squadB", match.teamB]] as const) {
      if (data[field] === undefined) continue;
      if (!Array.isArray(data[field])) return Response.json({ error: `${field} must be a list` }, { status: 400 });
      const roster = new Set((teams.get(teamId)?.players ?? []).map((p) => p._id));
      const squad = [...new Set<string>(data[field].filter(isId))];
      if (squad.some((p) => !roster.has(p))) return Response.json({ error: "A selected player is not on that team" }, { status: 400 });
      squads[field] = squad;
      set[field] = squad;
    }
  }

  if (data.playerOfMatch !== undefined) {
    if (!data.playerOfMatch) set.playerOfMatch = null;
    else if (![...squads.squadA, ...squads.squadB].includes(data.playerOfMatch)) return Response.json({ error: "That player did not play in this match" }, { status: 400 });
    else set.playerOfMatch = data.playerOfMatch;
  }

  if (Object.keys(set).length > 0) await getDb().update(M).set(set).where(eq(M.id, id));
  return Response.json({ match: await adminMatchView((await getMatch(id))!) });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/cricket/matches/[id]">) {
  const auth = await authorize("cricket.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!(await getMatch(id))) return NOT_FOUND();
  await getDb().delete(M).where(eq(M.id, id));
  return Response.json({ success: true });
}
