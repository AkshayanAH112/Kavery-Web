import { and } from "drizzle-orm";
import { LIVE_SECONDS, cachedJson, findMatchCards, loadTeams, loadTournaments, matchStatusIn, publicMatchWhere, publishedTournamentsWhere } from "@/lib/cricket/server";
import { matchCard } from "@/lib/cricket/view";

// Public and unauthenticated by design. Never add anything per-viewer: the response is shared at the edge.
export async function GET(request: Request) {
  return cachedJson(request, LIVE_SECONDS, async () => {
    const tournaments = await loadTournaments(publishedTournamentsWhere);
    const visible = publicMatchWhere([...tournaments.keys()]);
    const [live, upcoming, results, teams] = await Promise.all([
      findMatchCards(and(visible, matchStatusIn(["live", "innings_break"])), "oldest", 20),
      findMatchCards(and(visible, matchStatusIn(["upcoming"])), "oldest", 12),
      findMatchCards(and(visible, matchStatusIn(["completed", "abandoned"])), "newest", 12),
      loadTeams(),
    ]);
    const card = (m: (typeof live)[number]) => matchCard(m, teams, m.tournamentId ? tournaments.get(m.tournamentId) : null);
    return {
      body: {
        live: live.map(card),
        upcoming: upcoming.map(card),
        results: results.map(card),
        tournaments: [...tournaments.values()].map((t) => ({ name: t.name, slug: t.slug, season: t.season || null, status: t.status, teamCount: t.teams.length })),
      },
    };
  });
}
