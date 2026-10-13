import { and } from "drizzle-orm";
import { BROWSE_SECONDS, cachedJson, findMatchCards, isId, isTeamPublic, loadTeams, loadTournaments, matchInvolvesTeam, publicMatchWhere, publishedTournamentsWhere } from "@/lib/cricket/server";
import { matchCard, teamBrief } from "@/lib/cricket/view";

export async function GET(request: Request, { params }: RouteContext<"/api/public/cricket/teams/[id]">) {
  const { id } = await params;
  return cachedJson(request, BROWSE_SECONDS, async () => {
    const notFound = { status: 404, body: { error: "Team not found" } };
    if (!isId(id)) return notFound;

    const tournaments = await loadTournaments(publishedTournamentsWhere);
    const published = [...tournaments.values()];
    // A team with no published tournament and no public match answers 404, so squads still being set up cannot be read by id.
    if (!(await isTeamPublic(id, published))) return notFound;

    const matches = await findMatchCards(and(publicMatchWhere(published.map((t) => t._id)), matchInvolvesTeam(id)), "newest", 60);
    const teams = await loadTeams([id, ...matches.flatMap((m) => [m.teamA, m.teamB])]);
    const team = teams.get(id);
    if (!team) return notFound;

    return {
      body: {
        team: teamBrief(teams, id),
        players: team.players.map((p) => ({ id: p._id, name: p.name, role: p.role ?? "batter", isCaptain: !!p.isCaptain, isKeeper: !!p.isKeeper })),
        matches: matches.map((m) => matchCard(m, teams, m.tournamentId ? tournaments.get(m.tournamentId) : null)),
        tournaments: published.filter((t) => t.teams.includes(id)).map((t) => ({ name: t.name, slug: t.slug, season: t.season || null })),
      },
    };
  });
}
