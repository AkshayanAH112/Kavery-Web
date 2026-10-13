import { cache } from "react";
import { findPlayerTeamId, getPublicMatch, getPublishedTournamentBySlug, isId, isTeamPublic, loadTeams, loadTournaments, publishedTournamentsWhere } from "./server";

/**
 * Names for page titles and breadcrumbs on the public match pages. Each returns
 * null for anything that is not public (or does not exist), by the same rules
 * the public API uses — so a hidden match's teams never leak through a <title>.
 * Wrapped in cache(): generateMetadata and the page ask for the same name.
 */
const publishedTournaments = cache(async () => [...(await loadTournaments(publishedTournamentsWhere)).values()]);

export const matchTitle = cache(async (id: string): Promise<string | null> => {
  const found = await getPublicMatch(id);
  if (!found) return null;
  const teams = await loadTeams([found.match.teamA, found.match.teamB]);
  const a = teams.get(found.match.teamA)?.name;
  const b = teams.get(found.match.teamB)?.name;
  return a && b ? `${a} v ${b}` : null;
});

export const tournamentTitle = cache(async (slug: string): Promise<string | null> => {
  const tournament = await getPublishedTournamentBySlug(slug);
  return tournament ? [tournament.name, tournament.season].filter(Boolean).join(" ") : null;
});

export const teamTitle = cache(async (id: string): Promise<string | null> => {
  if (!isId(id) || !(await isTeamPublic(id, await publishedTournaments()))) return null;
  return (await loadTeams([id])).get(id)?.name ?? null;
});

export const playerTitle = cache(async (id: string): Promise<string | null> => {
  const teamId = await findPlayerTeamId(id);
  if (!teamId || !(await isTeamPublic(teamId, await publishedTournaments()))) return null;
  const team = (await loadTeams([teamId])).get(teamId);
  const player = team?.players.find((p) => p._id === id);
  return team && player ? `${player.name} (${team.name})` : null;
});
