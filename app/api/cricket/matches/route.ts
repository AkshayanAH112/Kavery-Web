import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { findMatchCards, getTournament, isId, loadTeams, loadTournaments, parseDate, parseOvers, readBody, text } from "@/lib/cricket/server";
import { matchCard } from "@/lib/cricket/view";

export async function GET() {
  const auth = await authorize("cricket.score");
  if (!auth.ok) return auth.response;

  const [matches, teams, tournaments] = await Promise.all([findMatchCards(undefined, "newest", 200), loadTeams(), loadTournaments()]);
  return Response.json({
    matches: matches.map((m) => ({
      ...matchCard(m, teams, m.tournamentId ? tournaments.get(m.tournamentId) : null),
      isPublished: m.isPublished !== false,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await authorize("cricket.score");
  if (!auth.ok) return auth.response;

  const data = await readBody(request);
  if (!isId(data?.teamA) || !isId(data?.teamB)) return Response.json({ error: "Choose both teams" }, { status: 400 });
  if (data.teamA === data.teamB) return Response.json({ error: "A team cannot play itself" }, { status: 400 });

  const teams = await loadTeams([data.teamA, data.teamB]);
  const teamA = teams.get(data.teamA);
  const teamB = teams.get(data.teamB);
  if (!teamA || !teamB) return Response.json({ error: "Team not found" }, { status: 404 });

  const tournament = data.tournamentId ? await getTournament(data.tournamentId) : null;
  if (data.tournamentId && !tournament) return Response.json({ error: "Tournament not found" }, { status: 404 });

  const overs = parseOvers(data.oversPerInnings ?? tournament?.oversPerInnings ?? 20);
  if (!overs) return Response.json({ error: "Overs per innings must be a whole number from 1 to 50" }, { status: 400 });

  const id = crypto.randomUUID();
  await getDb()
    .insert(schema.cricketMatches)
    .values({
      id,
      tournamentId: tournament?._id ?? null,
      title: text(data.title, 60) || null,
      teamA: teamA._id,
      teamB: teamB._id,
      // Everyone on the team sheet plays unless the scorer trims the squad before the toss.
      squadA: teamA.players.map((p) => p._id),
      squadB: teamB.players.map((p) => p._id),
      oversPerInnings: overs,
      venue: text(data.venue, 80) || tournament?.venue || null,
      startAt: parseDate(data.startAt),
      isPublished: data.isPublished !== false,
    });
  return Response.json({ match: { id } }, { status: 201 });
}
