import { and } from "drizzle-orm";
import { BROWSE_SECONDS, cachedJson, findMatches, findPlayerTeamId, isTeamPublic, loadTeams, loadTournaments, matchNamesPlayer, publicMatchWhere, publishedTournamentsWhere } from "@/lib/cricket/server";
import { aggregatePlayers, teamBrief } from "@/lib/cricket/view";

export async function GET(request: Request, { params }: RouteContext<"/api/public/cricket/players/[id]">) {
  const { id } = await params;
  return cachedJson(request, BROWSE_SECONDS, async () => {
    const notFound = { status: 404, body: { error: "Player not found" } };
    const teamId = await findPlayerTeamId(id);
    if (!teamId) return notFound;

    const published = [...(await loadTournaments(publishedTournamentsWhere)).values()];
    if (!(await isTeamPublic(teamId, published))) return notFound;

    const matches = await findMatches(and(publicMatchWhere(published.map((t) => t._id)), matchNamesPlayer(id)));
    const { totals, log } = aggregatePlayers(matches, id);
    const teams = await loadTeams([teamId, ...log.map((l) => l.opponent)]);
    const player = teams.get(teamId)?.players.find((p) => p._id === id);
    if (!player) return notFound;

    return {
      body: {
        player: { id, name: player.name, role: player.role ?? "batter", isCaptain: !!player.isCaptain, isKeeper: !!player.isKeeper },
        team: teamBrief(teams, teamId),
        totals: totals.get(id) ?? null,
        log: log.reverse().map((l) => ({ ...l, opponent: teamBrief(teams, l.opponent) })),
      },
    };
  });
}
