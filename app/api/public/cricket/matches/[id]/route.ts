import { LIVE_SECONDS, cachedJson, getPublicMatch, loadTeams } from "@/lib/cricket/server";
import { matchView } from "@/lib/cricket/view";

export async function GET(request: Request, { params }: RouteContext<"/api/public/cricket/matches/[id]">) {
  const { id } = await params;
  // Always the short cache, even for a finished match: a scorer can undo the
  // last ball of a completed game, and that correction should show within seconds.
  return cachedJson(request, LIVE_SECONDS, async () => {
    const found = await getPublicMatch(id);
    if (!found) return { status: 404, body: { error: "Match not found" } };
    const teams = await loadTeams([found.match.teamA, found.match.teamB]);
    return { body: { match: matchView(found.match, teams, found.tournament) } };
  });
}
