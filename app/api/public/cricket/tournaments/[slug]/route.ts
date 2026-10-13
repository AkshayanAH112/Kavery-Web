import { LIVE_SECONDS, cachedJson, findMatches, getPublishedTournamentBySlug, loadTeams, matchInTournament } from "@/lib/cricket/server";
import { MVP_POINTS, aggregatePlayers, matchCard, pointsTable, teamBrief } from "@/lib/cricket/view";

export async function GET(request: Request, { params }: RouteContext<"/api/public/cricket/tournaments/[slug]">) {
  const { slug } = await params;
  return cachedJson(request, LIVE_SECONDS, async () => {
    const tournament = await getPublishedTournamentBySlug(slug);
    if (!tournament) return { status: 404, body: { error: "Tournament not found" } };

    // The points table and player totals are derived from the deliveries, so this reads full matches.
    const matches = await findMatches(matchInTournament(tournament._id));
    const teams = await loadTeams([...tournament.teams, ...matches.flatMap((m) => [m.teamA, m.teamB])]);
    const { totals } = aggregatePlayers(matches);

    const players: Record<string, { name: string; team: string }> = {};
    for (const team of teams.values()) {
      for (const p of team.players) {
        if (totals.has(p._id)) players[p._id] = { name: p.name, team: team._id };
      }
    }

    return {
      body: {
        tournament: {
          name: tournament.name,
          slug: tournament.slug,
          season: tournament.season || null,
          venue: tournament.venue || null,
          status: tournament.status,
          oversPerInnings: tournament.oversPerInnings ?? null,
          startDate: tournament.startDate || null,
          endDate: tournament.endDate || null,
          points: { win: tournament.pointsWin, tie: tournament.pointsTie, noResult: tournament.pointsNoResult },
        },
        teams: tournament.teams.map((id) => teamBrief(teams, id)),
        matches: matches.map((m) => matchCard(m, teams, tournament)),
        table: pointsTable(tournament, matches),
        stats: { players, totals: [...totals.values()].filter((t) => players[t.id]), mvpPoints: MVP_POINTS },
      },
    };
  });
}
